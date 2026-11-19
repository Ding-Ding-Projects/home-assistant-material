"""Send the problem log to a private repository on GitHub.

Off until the owner turns it on. Sends at most once an hour, by hand or on
the hourly schedule, and only to a repository the host reports as private,
checked before every send. Everything that leaves is redacted first, and the
preview is made by the same code as the real send. Nothing is read back from
the repository except the revision ids needed to add one commit.
"""

import asyncio
from collections.abc import Callable
import contextlib
from dataclasses import dataclass
from datetime import datetime, timedelta
import json
import logging
import platform
import socket
from typing import Any
from urllib.parse import urlsplit

from homeassistant.const import __version__
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers import (
    area_registry as ar,
    device_registry as dr,
    entity_registry as er,
)
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_call_later, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .send_files import (
    STATUS_NOT_SENT,
    Problem,
    SystemInfo,
    build_files,
    commit_message,
    counts,
    may_send,
    next_allowed,
    parse_repository,
    status_of,
)
from .send_host import (
    DEVICE_APPROVED,
    DEVICE_DENIED,
    DEVICE_EXPIRED,
    DEVICE_PENDING,
    DEVICE_SLOW_DOWN,
    ERROR_NO_WRITE,
    ERROR_RATE_LIMITED,
    GitHubHost,
    HostError,
)
from .send_redact import (
    KIND_AREA,
    KIND_DEVICE,
    KIND_PERSON,
    KIND_PLACE,
    LabelBook,
    NamedThing,
    RedactContext,
    RedactionError,
    entity_names,
    redact_for_sending,
)

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "problem_log.send"
AUTH_STORAGE_KEY = "problem_log.send_auth"
STORAGE_VERSION = 1

MODE_BY_HAND = "by_hand"
MODE_HOURLY = "hourly"
MODES = (MODE_BY_HAND, MODE_HOURLY)

METHOD_DEVICE = "device"
METHOD_TOKEN = "token"

ERROR_OFF = "off"
ERROR_NO_REPOSITORY = "no_repository"
ERROR_NOT_SIGNED_IN = "not_signed_in"
ERROR_PUBLIC = "repository_public"
ERROR_VISIBILITY_UNKNOWN = "visibility_unknown"
ERROR_REDACTION = "redaction_failed"
ERROR_TOO_SOON = "too_soon"
ERROR_NOTHING_NEW = "nothing_new"
ERROR_NO_CLIENT_ID = "no_client_id"
ERROR_BUSY = "busy"

DEVICE_CANCELLED = "cancelled"
DEVICE_FAILED = "failed"

SCHEDULE_CHECK = timedelta(minutes=5)
RATE_LIMIT_FALLBACK = timedelta(minutes=15)

# The files that are written as they are, without passing names through
# redaction (they hold nothing about this home).
_FIXED_FILES = {"README.md"}


class SendRefused(Exception):
    """A send or check did not happen. Carries a plain code."""

    def __init__(self, code: str) -> None:
        """Initialize."""
        super().__init__(code)
        self.code = code


@dataclass
class _DeviceSignIn:
    state: str
    user_code: str = ""
    verification_uri: str = ""
    expires_at: datetime | None = None
    interval: int = 5
    device_code: str = ""


def _kind(domain: str) -> str:
    """Return the label kind of an entity domain."""
    if domain == "zone":
        return KIND_PLACE
    if domain == "person":
        return KIND_PERSON
    return domain


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment else None


def _parse(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    return dt_util.parse_datetime(value)


class ProblemLogSender:
    """The owner's settings and the sending of the problem log."""

    def __init__(
        self,
        hass: HomeAssistant,
        log: Any,
        host_factory: Callable[[], Any] | None = None,
    ) -> None:
        """Initialize."""
        self.hass = hass
        self._log = log
        self._host_factory = host_factory or (
            lambda: GitHubHost(async_get_clientsession(hass))
        )
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, STORAGE_KEY, private=True
        )
        self._auth_store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, AUTH_STORAGE_KEY, private=True
        )
        self.enabled = False
        self.mode = MODE_BY_HAND
        self.repository = ""
        self.keep_names = False
        self.client_id = ""
        self._token: str | None = None
        self._method: str | None = None
        self.last_sent: datetime | None = None
        self.backoff_until: datetime | None = None
        self.sent: dict[str, int] = {}
        self.held: set[str] = set()
        self.book = LabelBook()
        self.last_error: dict[str, Any] | None = None
        self.last_check: dict[str, Any] | None = None
        self.last_commit: str | None = None
        self._device: _DeviceSignIn | None = None
        self._device_timer: CALLBACK_TYPE | None = None
        self._schedule: CALLBACK_TYPE | None = None
        self._lock = asyncio.Lock()
        self._statuses: dict[str, str] = {}

    async def async_load(self) -> None:
        """Read the stored settings and start the schedule."""
        data = await self._store.async_load() or {}
        settings = data.get("settings", {})
        self.enabled = bool(settings.get("enabled", False))
        self.mode = (
            settings.get("mode") if settings.get("mode") in MODES else MODE_BY_HAND
        )
        self.repository = str(settings.get("repository", ""))
        self.keep_names = bool(settings.get("keep_names", False))
        self.client_id = str(settings.get("client_id", ""))
        self.last_sent = _parse(data.get("last_sent"))
        self.backoff_until = _parse(data.get("backoff_until"))
        sent = data.get("sent", {})
        self.sent = (
            {str(k): int(v) for k, v in sent.items() if isinstance(v, int)}
            if isinstance(sent, dict)
            else {}
        )
        self.held = {str(item) for item in data.get("held", [])}
        self.book = LabelBook.from_dict(data.get("labels"))
        self.last_error = data.get("last_error")
        self.last_check = data.get("last_check")
        self.last_commit = data.get("last_commit")
        auth = await self._auth_store.async_load() or {}
        if isinstance(auth.get("token"), str) and auth["token"]:
            self._token = auth["token"]
            self._method = str(auth.get("method", METHOD_TOKEN))
        self._schedule = async_track_time_interval(
            self.hass, self._async_tick, SCHEDULE_CHECK
        )

    @callback
    def async_stop(self) -> None:
        """Stop the schedule and any waiting sign-in."""
        if self._schedule is not None:
            self._schedule()
            self._schedule = None
        self._cancel_device_timer()

    def _data(self) -> dict[str, Any]:
        return {
            "settings": {
                "enabled": self.enabled,
                "mode": self.mode,
                "repository": self.repository,
                "keep_names": self.keep_names,
                "client_id": self.client_id,
            },
            "last_sent": _iso(self.last_sent),
            "backoff_until": _iso(self.backoff_until),
            "sent": self.sent,
            "held": sorted(self.held),
            "labels": self.book.as_dict(),
            "last_error": self.last_error,
            "last_check": self.last_check,
            "last_commit": self.last_commit,
        }

    async def _async_save(self) -> None:
        await self._store.async_save(self._data())

    async def _async_save_auth(self) -> None:
        await self._auth_store.async_save(
            {"token": self._token, "method": self._method} if self._token else {}
        )

    @property
    def signed_in(self) -> bool:
        """Return True if a sign-in is stored."""
        return bool(self._token)

    async def _async_problems(self) -> list[Problem]:
        await self._log.async_flush()
        overview = await self.hass.async_add_executor_job(self._log.list_problems)
        return [Problem.from_record(item) for item in overview.get("problems", [])]

    async def async_state(self) -> dict[str, Any]:
        """Return everything the page shows. Never includes the sign-in."""
        problems = await self._async_problems()
        self._statuses = {p.file: status_of(p, self.sent, self.held) for p in problems}
        device = None
        if self._device is not None:
            device = {
                "state": self._device.state,
                "user_code": self._device.user_code,
                "verification_uri": self._device.verification_uri,
                "expires_at": _iso(self._device.expires_at),
                "interval": self._device.interval,
            }
        return {
            "enabled": self.enabled,
            "mode": self.mode,
            "repository": self.repository,
            "keep_names": self.keep_names,
            "client_id": self.client_id,
            "device_sign_in_available": bool(self.client_id),
            "signed_in": self.signed_in,
            "sign_in_method": self._method if self.signed_in else None,
            "last_sent": _iso(self.last_sent),
            "next_allowed": _iso(next_allowed(self.last_sent, self.backoff_until)),
            "backoff_until": _iso(self.backoff_until),
            "last_error": self.last_error,
            "last_check": self.last_check,
            "last_commit": self.last_commit,
            "device": device,
            "statuses": self._statuses,
            "counts": counts(problems, self.sent, self.held),
        }

    async def async_update_settings(self, changes: dict[str, Any]) -> None:
        """Change settings. Turning on checks the repository first."""
        if "repository" in changes:
            address = str(changes["repository"]).strip()
            if address and parse_repository(address) is None:
                raise SendRefused(ERROR_NO_REPOSITORY)
            if address != self.repository:
                self.last_check = None
                self.enabled = False
            self.repository = address
        if "mode" in changes and changes["mode"] in MODES:
            self.mode = changes["mode"]
        if "keep_names" in changes:
            self.keep_names = bool(changes["keep_names"])
        if "client_id" in changes:
            self.client_id = str(changes["client_id"]).strip()
        if "enabled" in changes:
            if changes["enabled"]:
                await self._async_check_repository()
                self.enabled = True
            else:
                self.enabled = False
        await self._async_save()

    async def async_set_token(self, token: str) -> dict[str, Any] | None:
        """Store a token from the owner, then check the repository with it."""
        token = token.strip()
        if not token:
            raise SendRefused(ERROR_NOT_SIGNED_IN)
        self._token = token
        self._method = METHOD_TOKEN
        await self._async_save_auth()
        return await self._async_check_quietly()

    async def async_sign_out(self) -> None:
        """Forget the sign-in and turn sending off."""
        self._token = None
        self._method = None
        self.enabled = False
        self.last_check = None
        self._cancel_device_timer()
        self._device = None
        await self._async_save_auth()
        await self._async_save()

    async def _async_check_quietly(self) -> dict[str, Any] | None:
        if not self.repository:
            return None
        with contextlib.suppress(SendRefused):
            await self._async_check_repository()
        await self._async_save()
        return self.last_check

    async def async_test(self) -> dict[str, Any]:
        """Check the repository without sending anything."""
        try:
            await self._async_check_repository()
        finally:
            await self._async_save()
        return self.last_check or {}

    async def _async_check_repository(self) -> tuple[Any, str, str, str]:
        """Read visibility and permission from the host; refuse unless private."""
        target = parse_repository(self.repository) if self.repository else None
        if target is None:
            raise SendRefused(ERROR_NO_REPOSITORY)
        if not self._token:
            raise SendRefused(ERROR_NOT_SIGNED_IN)
        owner, name = target
        host = self._host_factory()
        now = dt_util.utcnow()
        try:
            info = await host.repository(owner, name, self._token)
        except HostError as err:
            self.last_check = {"ok": False, "error": err.code, "at": _iso(now)}
            self._note_rate_limit(err, now)
            raise SendRefused(err.code) from None
        is_private = info.private and info.visibility in ("private", "")
        if not info.private or info.visibility == "public":
            code: str | None = ERROR_PUBLIC
        elif not is_private:
            # "internal" and anything new: readable beyond the owner, or unknown.
            code = ERROR_VISIBILITY_UNKNOWN
        elif not info.can_push:
            code = ERROR_NO_WRITE
        else:
            code = None
        self.last_check = {
            "ok": code is None,
            "error": code,
            "private": is_private,
            "can_push": info.can_push,
            "at": _iso(now),
        }
        if code is not None:
            raise SendRefused(code)
        return host, owner, name, info.default_branch

    def _note_rate_limit(self, err: HostError, now: datetime) -> None:
        if err.code != ERROR_RATE_LIMITED:
            return
        wait = (
            timedelta(seconds=err.retry_after)
            if err.retry_after
            else RATE_LIMIT_FALLBACK
        )
        self.backoff_until = now + wait

    async def async_hold(self, file: str, held: bool) -> None:
        """Hold a problem back from every send, or let it go again."""
        if held:
            self.held.add(file)
        else:
            self.held.discard(file)
        await self._async_save()

    async def _async_context(self) -> RedactContext:
        """Gather what is private about this home."""
        hass = self.hass
        secrets = await hass.async_add_executor_job(
            self._log._load_secrets  # noqa: SLF001
        )
        hostnames = [socket.gethostname()]
        hostnames.extend(
            host
            for url in (hass.config.internal_url, hass.config.external_url)
            if url and (host := urlsplit(url).hostname)
        )
        coordinates = [hass.config.latitude, hass.config.longitude]
        things: list[NamedThing] = []
        if hass.config.location_name:
            things.append(
                NamedThing("location", KIND_PLACE, (hass.config.location_name,))
            )
        for state in hass.states.async_all():
            if state.domain == "zone":
                coordinates.extend(
                    float(value)
                    for key in ("latitude", "longitude")
                    if isinstance(value := state.attributes.get(key), int | float)
                )
            friendly = state.attributes.get("friendly_name")
            things.append(
                NamedThing(
                    state.entity_id,
                    _kind(state.domain),
                    entity_names(
                        state.entity_id, friendly if isinstance(friendly, str) else None
                    ),
                )
            )
        things.extend(
            NamedThing(
                entry.entity_id,
                _kind(entry.domain),
                (entry.entity_id, entry.name) if entry.name else (entry.entity_id,),
            )
            for entry in er.async_get(hass).entities.values()
        )
        things.extend(
            NamedThing(f"device:{device.id}", KIND_DEVICE, names)
            for device in dr.async_get(hass).devices
            if (names := tuple(n for n in (device.name_by_user, device.name) if n))
        )
        things.extend(
            NamedThing(f"area:{area.id}", KIND_AREA, (area.name,))
            for area in ar.async_get(hass).async_list_areas()
        )
        things.extend(
            NamedThing(f"user:{user.id}", KIND_PERSON, (user.name,))
            for user in await hass.auth.async_get_users()
            if user.name and not user.system_generated
        )
        return RedactContext(
            secrets=list(secrets),
            hostnames=[h for h in hostnames if h],
            coordinates=[float(c) for c in coordinates if c is not None],
            things=things,
        )

    def _system(self) -> SystemInfo:
        hass = self.hass
        integrations = sorted(
            {c for c in hass.config.components if "." not in c}
            | {entry.domain for entry in hass.config_entries.async_entries()}
        )
        installation = "unknown"
        if "hassio" in hass.config.components:
            installation = "Home Assistant OS or Supervised"
        return SystemInfo(
            build=__version__,
            python=platform.python_version(),
            installation=installation,
            operating_system=platform.system(),
            architecture=platform.machine(),
            integrations=integrations,
        )

    async def _async_build(self) -> tuple[dict[str, str], list[Problem]]:
        """Make the redacted files of the next send. Raises SendRefused on failure."""
        problems = await self._async_problems()
        try:
            context = await self._async_context()
            system = self._system()
            zone = dt_util.get_default_time_zone()
            files = build_files(problems, self.held, system, zone)
            fixed = {path: text for path, text in files.items() if path in _FIXED_FILES}
            variable = {p: t for p, t in files.items() if p not in _FIXED_FILES}
            forbidden = [self._token] if self._token else []
            redacted = await self.hass.async_add_executor_job(
                lambda: redact_for_sending(
                    variable,
                    context,
                    self.book,
                    keep_names=self.keep_names,
                    forbidden=forbidden,
                )
            )
            for text in fixed.values():
                if any(value and value in text for value in forbidden):
                    raise RedactionError("A confidential value was still present")  # noqa: TRY301
            json.loads(redacted["problems/index.json"])
        except Exception as err:  # noqa: BLE001
            # Fail closed: whatever went wrong, nothing is sent.
            _LOGGER.warning(
                "The problem log was not prepared for sending (%s)", type(err).__name__
            )
            raise SendRefused(ERROR_REDACTION) from None
        return {**fixed, **redacted}, problems

    async def async_preview(self) -> dict[str, str]:
        """Return the exact files the next send would write."""
        async with self._lock:
            files, _ = await self._async_build()
            await self._async_save()
        return files

    async def async_send(self, *, scheduled: bool = False) -> dict[str, Any]:
        """Send once, if every rule allows it."""
        if self._lock.locked():
            raise SendRefused(ERROR_BUSY)
        async with self._lock:
            return await self._async_send_locked(scheduled)

    async def _async_send_locked(self, scheduled: bool) -> dict[str, Any]:
        now = dt_util.utcnow()
        if not self.enabled:
            raise SendRefused(ERROR_OFF)
        if not may_send(now, self.last_sent, self.backoff_until):
            raise SendRefused(ERROR_TOO_SOON)
        problems = await self._async_problems()
        waiting = sum(
            1 for p in problems if status_of(p, self.sent, self.held) == STATUS_NOT_SENT
        )
        if not waiting:
            raise SendRefused(ERROR_NOTHING_NEW)
        try:
            host, owner, name, branch = await self._async_check_repository()
            files, problems = await self._async_build()
            sha = await host.commit(
                owner,
                name,
                self._token,
                branch,
                files,
                commit_message(waiting, dt_util.as_local(now)),
            )
        except SendRefused as err:
            await self._async_failed(err.code, now, waiting)
            raise
        except HostError as err:
            self._note_rate_limit(err, now)
            await self._async_failed(err.code, now, waiting)
            raise SendRefused(err.code) from None
        self.last_sent = now
        self.backoff_until = None
        self.last_error = None
        self.last_commit = sha
        for problem in problems:
            if problem.file not in self.held:
                self.sent[problem.file] = problem.count
        known = {p.file for p in problems}
        self.sent = {k: v for k, v in self.sent.items() if k in known}
        await self._async_save()
        return {"sent": waiting, "commit": sha, "at": _iso(now), "scheduled": scheduled}

    async def _async_failed(self, code: str, now: datetime, waiting: int) -> None:
        self.last_error = {"code": code, "at": _iso(now), "waiting": waiting}
        _LOGGER.warning("The problem log was not sent: %s", code)
        await self._async_save()

    async def _async_tick(self, _now: datetime) -> None:
        """Send on the hourly schedule when it is time and something is new."""
        if not self.enabled or self.mode != MODE_HOURLY:
            return
        if not may_send(dt_util.utcnow(), self.last_sent, self.backoff_until):
            return
        try:
            await self.async_send(scheduled=True)
        except SendRefused:
            return

    @callback
    def _cancel_device_timer(self) -> None:
        if self._device_timer is not None:
            self._device_timer()
            self._device_timer = None

    async def async_device_start(self) -> dict[str, Any]:
        """Start a device sign-in and return the code for the owner."""
        if not self.client_id:
            raise SendRefused(ERROR_NO_CLIENT_ID)
        self._cancel_device_timer()
        host = self._host_factory()
        try:
            code = await host.device_code(self.client_id)
        except HostError as err:
            raise SendRefused(err.code) from None
        self._device = _DeviceSignIn(
            state=DEVICE_PENDING,
            user_code=code.user_code,
            verification_uri=code.verification_uri,
            expires_at=dt_util.utcnow() + timedelta(seconds=code.expires_in),
            interval=max(code.interval, 1),
            device_code=code.device_code,
        )
        self._schedule_poll()
        return (await self.async_state())["device"]

    @callback
    def _schedule_poll(self) -> None:
        if self._device is None:
            return
        self._device_timer = async_call_later(
            self.hass, self._device.interval, self._async_device_poll
        )

    async def _async_device_poll(self, _now: datetime) -> None:
        self._device_timer = None
        device = self._device
        if device is None or device.state not in (DEVICE_PENDING, DEVICE_SLOW_DOWN):
            return
        if device.expires_at and dt_util.utcnow() >= device.expires_at:
            device.state = DEVICE_EXPIRED
            device.device_code = ""
            return
        host = self._host_factory()
        try:
            answer = await host.device_poll(self.client_id, device.device_code)
        except HostError:
            device.state = DEVICE_FAILED
            device.device_code = ""
            return
        if self._device is not device or device.state == DEVICE_CANCELLED:
            return
        if answer.state == DEVICE_APPROVED and answer.token:
            device.state = DEVICE_APPROVED
            device.device_code = ""
            self._token = answer.token
            self._method = METHOD_DEVICE
            await self._async_save_auth()
            await self._async_check_quietly()
            return
        if answer.state == DEVICE_SLOW_DOWN:
            device.state = DEVICE_SLOW_DOWN
            device.interval = answer.interval or device.interval + 5
            self._schedule_poll()
            return
        if answer.state == DEVICE_PENDING:
            device.state = DEVICE_PENDING
            self._schedule_poll()
            return
        device.state = (
            DEVICE_EXPIRED if answer.state == DEVICE_EXPIRED else DEVICE_DENIED
        )
        device.device_code = ""

    async def async_device_cancel(self) -> None:
        """Stop waiting for the owner to approve."""
        self._cancel_device_timer()
        if self._device is not None:
            self._device.state = DEVICE_CANCELLED
            self._device.device_code = ""
