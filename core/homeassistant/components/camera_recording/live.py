"""Record a camera's live video around an event, for cameras that stream only through a service.

The camera service signs in and negotiates the video inside the camera
integration, exactly as it does for the browser. This module lets the bundled
go2rtc program act as the viewer: go2rtc is given a one-time loopback address,
posts its offer there, and the offer is passed to the camera entity's own WebRTC
handling. Only SDP crosses to go2rtc. The sign-in, tokens and provider
addresses never leave the integration that holds them.
"""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
import ipaddress
from pathlib import Path
import secrets
import time
from typing import Any

from aiohttp import web

from homeassistant.components.camera import (
    DATA_COMPONENT,
    WebRTCAnswer,
    WebRTCCandidate,
    WebRTCError,
    WebRTCMessage,
)
from homeassistant.components.http import KEY_HASS, HomeAssistantView
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util.hass_dict import HassKey
from homeassistant.util.ulid import ulid

from .backoff import is_rate_limited
from .const import (
    LIVE_EXTRA_WAIT_SECONDS,
    LIVE_ID_SECONDS,
    LIVE_OFFER_TIMEOUT_SECONDS,
    LIVE_URL_PATH,
    LOGGER,
)
from .events import ClipReason

MAX_OFFER_BYTES = 65536
CANDIDATE_GRACE_SECONDS = 0.3
PROXY_HEADERS = ("X-Forwarded-For", "X-Real-IP", "Forwarded")
STREAM_PREFIX = "camera_recording_"
GO2RTC_RTSP = "rtsp://127.0.0.1:18554"


@dataclass(slots=True)
class LiveSession:
    """One live view requested for one event. It can be claimed once."""

    token: str
    entity_id: str
    created: float = field(default_factory=lambda: time.monotonic())
    claimed: bool = False
    answered: bool = False
    failure: ClipReason | None = None
    camera_session: str | None = None


class LiveBroker:
    """Mints and checks the one-time ids that let go2rtc reach a camera's offer handling."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Start with no ids."""
        self.hass = hass
        self._sessions: dict[str, LiveSession] = {}

    def mint(self, entity_id: str) -> LiveSession:
        """A new random id for exactly one camera."""
        self._expire()
        session = LiveSession(secrets.token_urlsafe(24), entity_id)
        self._sessions[session.token] = session
        return session

    def claim(self, token: str) -> LiveSession | None:
        """The session for an id, once, within its lifetime."""
        self._expire()
        session = self._sessions.get(token)
        if session is None or session.claimed:
            return None
        session.claimed = True
        return session

    def discard(self, token: str) -> None:
        """Forget an id."""
        self._sessions.pop(token, None)

    def _expire(self) -> None:
        cutoff = time.monotonic() - LIVE_ID_SECONDS
        for token in [t for t, s in self._sessions.items() if s.created < cutoff]:
            session = self._sessions[token]
            if not session.claimed:
                del self._sessions[token]


LIVE_BROKER: HassKey[LiveBroker] = HassKey("camera_recording_live_broker")


def broker_for(hass: HomeAssistant) -> LiveBroker:
    """The one broker of this Home Assistant."""
    if LIVE_BROKER not in hass.data:
        hass.data[LIVE_BROKER] = LiveBroker(hass)
    return hass.data[LIVE_BROKER]


def peer_is_loopback(request: web.Request) -> bool:
    """Whether the TCP peer is this computer and no proxy stands in front of it."""
    if any(name in request.headers for name in PROXY_HEADERS):
        return False
    transport = request.transport
    peer = transport.get_extra_info("peername") if transport else None
    if not peer:
        return False
    try:
        address = ipaddress.ip_address(str(peer[0]).split("%")[0])
    except ValueError:
        return False
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    return address.is_loopback


def classify_offer_failure(text: str) -> ClipReason:
    """The reason for a refused offer, from well-known words only."""
    return ClipReason.RATE_LIMITED if is_rate_limited(text) else ClipReason.FAILED


def merge_candidates(sdp: str, candidates: list[Any]) -> str:
    """Add trickled ICE candidates to the sections of an answer."""
    lines = [line for line in sdp.replace("\r\n", "\n").split("\n") if line != ""]
    sections = [i for i, line in enumerate(lines) if line.startswith("m=")]
    if not sections or not candidates:
        return "\r\n".join(lines) + "\r\n"
    inserts: dict[int, list[str]] = {}
    for candidate in candidates:
        text = getattr(candidate, "candidate", "") or ""
        if not text:
            continue
        index = getattr(candidate, "sdp_m_line_index", None) or 0
        index = min(max(index, 0), len(sections) - 1)
        inserts.setdefault(index, []).append(
            text if text.startswith("a=") else f"a={text}"
        )
    out: list[str] = []
    for i, line in enumerate(lines):
        out.append(line)
        if i + 1 == len(lines) or lines[i + 1].startswith("m="):
            index = sum(1 for start in sections if start <= i) - 1
            if index >= 0:
                out.extend(inserts.pop(index, []))
    return "\r\n".join(out) + "\r\n"


class LiveOfferView(HomeAssistantView):
    """The WHEP-shaped address go2rtc uses to reach a camera's offer handling.

    It is not signed in: the one-time id in the address is the secret, it works
    once for 30 seconds, only for a caller on this computer.
    """

    url = LIVE_URL_PATH + "/{token}"
    name = "api:camera_recording:whep"
    requires_auth = False
    cors_allowed = False

    async def post(self, request: web.Request, token: str) -> web.Response:
        """Pass the SDP offer to the camera and return its SDP answer."""
        hass = request.app[KEY_HASS]
        if not peer_is_loopback(request):
            return web.Response(status=403)
        session = broker_for(hass).claim(token)
        if session is None:
            return web.Response(status=404)
        body = await request.content.read(MAX_OFFER_BYTES + 1)
        if len(body) > MAX_OFFER_BYTES or not body.startswith(b"v=0"):
            session.failure = ClipReason.FAILED
            return web.Response(status=400)
        camera = hass.data[DATA_COMPONENT].get_entity(session.entity_id)
        if camera is None:
            session.failure = ClipReason.FAILED
            return web.Response(status=404)

        loop = asyncio.get_running_loop()
        answer: asyncio.Future[str] = loop.create_future()
        candidates: list[Any] = []

        @callback
        def send_message(message: WebRTCMessage) -> None:
            if isinstance(message, WebRTCAnswer) and not answer.done():
                answer.set_result(message.answer)
            elif isinstance(message, WebRTCError) and not answer.done():
                answer.set_exception(
                    LiveOfferError(
                        classify_offer_failure(f"{message.code} {message.message}")
                    )
                )
            elif isinstance(message, WebRTCCandidate):
                candidates.append(message.candidate)

        session.camera_session = ulid()
        try:
            await camera.async_handle_async_webrtc_offer(
                body.decode(errors="replace"), session.camera_session, send_message
            )
            sdp = await asyncio.wait_for(answer, LIVE_OFFER_TIMEOUT_SECONDS)
        except TimeoutError:
            session.failure = ClipReason.TIMED_OUT
            return web.Response(status=504)
        except LiveOfferError as err:
            session.failure = err.reason
            return web.Response(
                status=429 if err.reason is ClipReason.RATE_LIMITED else 502
            )
        except HomeAssistantError as err:
            session.failure = classify_offer_failure(str(err))
            return web.Response(
                status=429 if session.failure is ClipReason.RATE_LIMITED else 502
            )
        except Exception as err:  # noqa: BLE001
            LOGGER.warning(
                "A live offer for %s failed unexpectedly (%s)",
                session.entity_id,
                type(err).__name__,
            )
            session.failure = ClipReason.FAILED
            return web.Response(status=502)
        await asyncio.sleep(CANDIDATE_GRACE_SECONDS)
        session.answered = True
        return web.Response(
            status=201,
            body=merge_candidates(sdp, candidates).encode(),
            content_type="application/sdp",
            headers={"Location": f"{LIVE_URL_PATH}/{token}"},
        )

    async def patch(self, request: web.Request, token: str) -> web.Response:
        """Trickled candidates from go2rtc are not needed: the service answers directly."""
        if not peer_is_loopback(request):
            return web.Response(status=403)
        return web.Response(status=204)

    async def delete(self, request: web.Request, token: str) -> web.Response:
        """go2rtc ending its session."""
        if not peer_is_loopback(request):
            return web.Response(status=403)
        return web.Response(status=200)


class LiveOfferError(Exception):
    """A camera service refused the offer, with the reason code."""

    def __init__(self, reason: ClipReason) -> None:
        """Keep the code only."""
        super().__init__(reason.value)
        self.reason = reason


@dataclass(slots=True)
class Go2RtcAccess:
    """The bundled go2rtc program, reached through its own integration."""

    rest: Any
    add: Callable[[str, str], Any]
    remove: Callable[[str], Any]
    rtsp_base: str = GO2RTC_RTSP


@callback
def async_go2rtc_access(hass: HomeAssistant) -> Go2RtcAccess | None:
    """The bundled go2rtc program's client, or None when its integration is not set up."""
    entries = hass.config_entries.async_loaded_entries("go2rtc")
    if not entries:
        return None
    provider = entries[0].runtime_data
    rest = getattr(provider, "_rest_client", None)
    if rest is None:
        return None

    async def add(name: str, source: str) -> None:
        await rest.streams.add(name, source)

    async def remove(name: str) -> None:
        await rest._client.request("DELETE", "/api/streams", params={"src": name})  # noqa: SLF001

    return Go2RtcAccess(rest, add, remove)


def whep_source(hass: HomeAssistant, token: str) -> str | None:
    """The go2rtc source that pulls through the one-time address, or None when not possible."""
    http = getattr(hass, "http", None)
    if http is None or hass.config.api is None or hass.config.api.use_ssl:
        return None
    return (
        f"webrtc:http://127.0.0.1:{http.server_port}{LIVE_URL_PATH}/{token}#format=whep"
    )


def clip_command(binary: str, source: str, output: Path, seconds: int) -> list[str]:
    """ffmpeg: copy the video for a fixed time into one MP4 file, audio to AAC."""
    return [
        binary,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-rtsp_transport",
        "tcp",
        "-i",
        source,
        "-t",
        str(seconds),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-f",
        "mp4",
        str(output),
    ]


def probe_duration(path: Path) -> float | None:
    """The real length of a clip in seconds. Runs in the executor."""
    try:
        import av  # noqa: PLC0415

        with av.open(str(path)) as container:
            if container.duration:
                return container.duration / 1_000_000
    except Exception:  # noqa: BLE001
        return None
    return None


async def async_record_clip(
    binary: str, source: str, output: Path, seconds: int
) -> bool:
    """Run ffmpeg for one clip. True when it ended cleanly with a file."""
    process = await asyncio.create_subprocess_exec(
        *clip_command(binary, source, output, seconds),
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        code = await asyncio.wait_for(process.wait(), seconds + LIVE_EXTRA_WAIT_SECONDS)
    except TimeoutError:
        process.kill()
        await process.wait()
        return False
    return code == 0
