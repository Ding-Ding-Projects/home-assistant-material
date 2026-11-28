"""Record one camera around the clock into short MP4 segments with ffmpeg."""

import asyncio
from collections import deque
from collections.abc import Callable, Mapping
from contextlib import suppress
from enum import StrEnum
import logging
import os
from pathlib import Path
import re
import time
import traceback
from typing import Any
from urllib.parse import unquote

from homeassistant.components.camera import (
    async_get_stream_source,
    get_camera_from_entity_id,
)
from homeassistant.components.ffmpeg import get_ffmpeg_manager
from homeassistant.components.stream import (
    CONF_RTSP_TRANSPORT,
    CONF_USE_WALLCLOCK_AS_TIMESTAMPS,
)
from homeassistant.const import CONF_VERIFY_SSL
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from .backoff import is_rate_limited, wait_for_attempt
from .const import (
    LOGGER,
    NO_STREAM_WAIT_SECONDS,
    RATE_LIMIT_WAIT_SECONDS,
    RESTART_BACKOFF_SECONDS,
    SEGMENT_SUFFIX,
    SEGMENT_TIME_FORMAT,
)
from .problem_log import ProblemLog, comparison_key, mask_secrets, source_summary

STABLE_RUN_SECONDS = 120
STOP_TIMEOUT = 10
SOCKET_TIMEOUT_SECONDS = 15
# A run that has produced no video this long after it started is cut and retried.
FIRST_FILE_SECONDS = 60
# So is a run whose newest file has stopped growing for this long.
STALL_SECONDS = 60
WATCHDOG_INTERVAL_SECONDS = 10
STDERR_LINES = 20
OWN_SEGMENT = re.compile(r"^\d{8}T\d{6}Z" + re.escape(SEGMENT_SUFFIX) + r"$")


class RecorderState(StrEnum):
    """What a camera recorder is doing."""

    STARTING = "starting"
    RECORDING = "recording"
    RECONNECTING = "reconnecting"
    NO_STREAM = "no_stream"
    LIMITED = "limited"
    PAUSED = "paused"
    STOPPED = "stopped"


def build_command(
    binary: str,
    source: str,
    folder: Path,
    segment_seconds: int,
    stream_options: Mapping[str, Any] | None = None,
) -> list[str]:
    """The ffmpeg command: video copied as it is, audio to AAC, one file per segment."""
    options = stream_options or {}
    command = [binary, "-hide_banner", "-loglevel", "warning", "-nostdin", "-y"]
    timeout = str(SOCKET_TIMEOUT_SECONDS * 1_000_000)
    if source.startswith(("rtsp://", "rtsps://")):
        transport = options.get(CONF_RTSP_TRANSPORT) or "tcp"
        command += ["-rtsp_transport", str(transport), "-timeout", timeout]
    elif source.startswith(("http://", "https://")):
        command += ["-rw_timeout", timeout]
    if source.startswith(("rtsps://", "https://")):
        command += ["-tls_verify", "1" if options.get(CONF_VERIFY_SSL) else "0"]
    if options.get(CONF_USE_WALLCLOCK_AS_TIMESTAMPS):
        command += ["-use_wallclock_as_timestamps", "1"]
    command += [
        "-i",
        source,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-f",
        "segment",
        "-segment_time",
        str(segment_seconds),
        "-segment_atclocktime",
        "1",
        "-reset_timestamps",
        "1",
        "-strftime",
        "1",
        "-segment_format",
        "mp4",
        str(folder / f"{SEGMENT_TIME_FORMAT}{SEGMENT_SUFFIX}"),
    ]
    return command


class CameraRecorder:
    """Keeps one ffmpeg process recording a camera, restarting it when it stops."""

    def __init__(
        self,
        hass: HomeAssistant,
        entity_id: str,
        folder: Path,
        segment_seconds: int,
        on_change: Callable[[], None],
        place: str = "",
    ) -> None:
        """Set up the recorder. Nothing runs until start."""
        self.hass = hass
        self.entity_id = entity_id
        self.folder = folder
        self.segment_seconds = segment_seconds
        self.place = place
        self._on_change = on_change
        self.state = RecorderState.STOPPED
        self.last_error: str | None = None
        self.no_source = False
        self.retry_at: float | None = None
        self.started_at: float | None = None
        self.source_text: str | None = None
        self._source: str | None = None
        self.stderr_tail: list[str] = []
        self.last_exit_code: int | None = None
        self.problems = ProblemLog(LOGGER, f"Recording {entity_id}")
        self._task: asyncio.Task[None] | None = None
        self._process: asyncio.subprocess.Process | None = None
        self._stopping = False
        self._cut_reason: str | None = None
        self._failures = 0
        self._no_stream_attempts = 0
        self._limited_attempts = 0
        self._no_stream_noted = False

    @property
    def running(self) -> bool:
        """Whether the recorder loop is active (recording or trying to)."""
        return self._task is not None and not self._task.done()

    def _set(self, state: RecorderState, error: str | None = None) -> None:
        if state != self.state:
            LOGGER.log(
                logging.INFO if state is RecorderState.RECORDING else logging.DEBUG,
                "Recording %s changed from %s to %s (place: %s)",
                self.entity_id,
                self.state,
                state,
                self.place or "unknown",
            )
        self.state = state
        if error is not None:
            self.last_error = mask_secrets(error)
        self._on_change()

    def _suffix(self, delay: float | None = None) -> str:
        place = self.place or "unknown"
        suffix = f" [camera: {self.entity_id}, place: {place}, state: {self.state}"
        if delay is not None:
            suffix += f", retry in {delay:.0f} s"
        return suffix + "]"

    def start(self) -> None:
        """Start recording in the background."""
        if self.running:
            return
        self._stopping = False
        self._set(RecorderState.STARTING)
        self._task = self.hass.async_create_background_task(
            self._run(), f"camera_recording {self.entity_id}"
        )

    async def stop(self, paused: bool = False) -> None:
        """Stop ffmpeg so the current segment is finished cleanly."""
        self._stopping = True
        process = self._process
        if process is not None and process.returncode is None:
            with suppress(ProcessLookupError):
                # SIGINT makes ffmpeg finish the open segment before it exits.
                process.send_signal(2)
            try:
                await asyncio.wait_for(process.wait(), STOP_TIMEOUT)
            except TimeoutError:
                with suppress(ProcessLookupError):
                    process.kill()
        if self._task is not None:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        self._set(RecorderState.PAUSED if paused else RecorderState.STOPPED)

    def configure(self, folder: Path, segment_seconds: int) -> None:
        """Change where and how long the files are before the next start."""
        self.folder = folder
        self.segment_seconds = segment_seconds

    async def _wait(self, seconds: float) -> None:
        self.retry_at = time.time() + seconds
        try:
            await asyncio.sleep(seconds)
        finally:
            self.retry_at = None

    def _why_no_source(self) -> tuple[str, bool]:
        """Why there is no stream, and whether that is how the camera is meant to be."""
        entity_state = self.hass.states.get(self.entity_id)
        if entity_state is None:
            return "the camera entity does not exist", False
        if entity_state.state in ("unavailable", "unknown"):
            return f"the camera is {entity_state.state}", False
        return "the camera integration returned no stream address", True

    def _stream_options(self) -> Mapping[str, Any]:
        try:
            return get_camera_from_entity_id(self.hass, self.entity_id).stream_options
        except HomeAssistantError:
            return {}

    def _redact(self, text: str) -> str:
        """The text with the exact stream address, in any spelling, hidden."""
        if self._source:
            for variant in {self._source, unquote(self._source)}:
                text = text.replace(variant, self.source_text or "the stream")
        return mask_secrets(text)

    def _segment_sizes(self) -> dict[str, int]:
        """The recorder's own segments, by name. Event and live clips are not these."""
        sizes: dict[str, int] = {}
        try:
            with os.scandir(self.folder) as entries:
                for entry in entries:
                    if OWN_SEGMENT.match(entry.name):
                        with suppress(OSError):
                            sizes[entry.name] = entry.stat().st_size
        except OSError:
            pass
        return sizes

    async def _watch_output(
        self,
        process: asyncio.subprocess.Process,
        baseline: dict[str, int],
        started: float,
    ) -> None:
        """Cut a run that wrote nothing or stalled, and note when it is healthy."""
        previous = baseline
        last_progress = started
        seen = False
        stable = False
        while process.returncode is None:
            await asyncio.sleep(WATCHDOG_INTERVAL_SECONDS)
            if process.returncode is not None:
                return
            sizes = await self.hass.async_add_executor_job(self._segment_sizes)
            now = time.monotonic()
            if any(size > previous.get(name, 0) for name, size in sizes.items()):
                last_progress = now
                if not seen:
                    seen = True
                    self._set(RecorderState.RECORDING)
                if not stable and now - started >= STABLE_RUN_SECONDS:
                    stable = True
                    self._failures = 0
                    self.problems.recovered()
            previous = sizes
            limit = STALL_SECONDS if seen else FIRST_FILE_SECONDS
            if now - last_progress >= limit:
                what = "no new video was written" if seen else "no video was written"
                self._cut_reason = (
                    f"{what} in {limit} s while ffmpeg was running "
                    f"for {self.source_text}"
                )
                with suppress(ProcessLookupError):
                    process.kill()
                return

    async def _run(self) -> None:
        while not self._stopping:
            try:
                delay = await self._attempt()
            except asyncio.CancelledError:
                raise
            except Exception as err:  # noqa: BLE001
                message = f"unexpected {type(err).__name__}: {self._redact(str(err))}"
                LOGGER.debug(
                    "Recording %s hit an unexpected error:\n%s",
                    self.entity_id,
                    self._redact("".join(traceback.format_exception(err))),
                )
                delay = self._backoff()
                self._set(RecorderState.RECONNECTING, message)
                self.problems.failed(
                    message,
                    suffix=self._suffix(delay),
                    key=comparison_key(message),
                )
            if delay is None:
                return
            await self._wait(delay)

    def _backoff(self) -> float:
        delay = RESTART_BACKOFF_SECONDS[
            min(self._failures, len(RESTART_BACKOFF_SECONDS) - 1)
        ]
        self._failures += 1
        return delay

    async def _attempt(self) -> float | None:
        """One try to get a stream and record it. Returns the wait before the next."""
        error: str | None = None
        try:
            async with asyncio.timeout(10):
                source = await async_get_stream_source(self.hass, self.entity_id)
        except HomeAssistantError as err:
            source = None
            error = self._redact(str(err))
            self.last_error = error
        except TimeoutError:
            source = None
            error = "the camera did not give its stream address within 10 s"
            self.last_error = error
        if not source:
            self.no_source = error is None
            if is_rate_limited(error):
                delay = wait_for_attempt(
                    self._limited_attempts, RATE_LIMIT_WAIT_SECONDS
                )
                self._limited_attempts += 1
                self._set(RecorderState.LIMITED, error)
                summary = f"the camera provider is limiting requests ({error})"
            else:
                delay = wait_for_attempt(
                    self._no_stream_attempts, NO_STREAM_WAIT_SECONDS
                )
                self._no_stream_attempts += 1
                reason, expected = (error, False) if error else self._why_no_source()
                self._set(
                    RecorderState.NO_STREAM,
                    error or "The camera does not offer a video stream",
                )
                if expected:
                    if not self._no_stream_noted:
                        self._no_stream_noted = True
                        LOGGER.info(
                            "Recording %s has nothing to record continuously: %s. "
                            "Events can still be kept through the provider%s",
                            self.entity_id,
                            reason,
                            self._suffix(),
                        )
                    return delay
                summary = f"no stream to record, {reason}"
            self.problems.failed(
                summary, suffix=self._suffix(delay), key=comparison_key(summary)
            )
            return delay
        self.no_source = False
        self._limited_attempts = 0
        self._no_stream_attempts = 0
        self._no_stream_noted = False

        await self.hass.async_add_executor_job(
            lambda: self.folder.mkdir(parents=True, exist_ok=True)
        )
        options = self._stream_options()
        command = build_command(
            get_ffmpeg_manager(self.hass).binary,
            source,
            self.folder,
            self.segment_seconds,
            options,
        )
        self._source = source
        self.source_text = source_summary(source)
        LOGGER.debug(
            "Recording %s starts ffmpeg from %s into %s with stream options %s",
            self.entity_id,
            self.source_text,
            self.folder,
            sorted(options),
        )
        baseline = await self.hass.async_add_executor_job(self._segment_sizes)
        started = time.monotonic()
        self._cut_reason = None
        try:
            process = await asyncio.create_subprocess_exec(
                *command,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, "TZ": "UTC"},
            )
        except OSError as err:
            message = f"could not start ffmpeg: {self._redact(str(err))}"
            delay = self._backoff()
            self._set(RecorderState.RECONNECTING, message)
            self.problems.failed(
                message, suffix=self._suffix(delay), key=comparison_key(message)
            )
            return delay

        self._process = process
        tail: deque[str] = deque(maxlen=STDERR_LINES)
        watchdog: asyncio.Task[None] | None = None
        try:
            self.started_at = time.time()
            self._set(RecorderState.STARTING)
            watchdog = asyncio.create_task(
                self._watch_output(process, baseline, started)
            )
            if process.stderr is not None:
                async for line in process.stderr:
                    tail.append(self._redact(line.decode(errors="replace").strip()))
            code = await process.wait()
        finally:
            if watchdog is not None:
                watchdog.cancel()
                with suppress(asyncio.CancelledError):
                    await watchdog
            if process.returncode is None:
                with suppress(ProcessLookupError):
                    process.kill()
                with suppress(TimeoutError):
                    await asyncio.wait_for(process.wait(), STOP_TIMEOUT)
            self._process = None
        self.last_exit_code = code
        self.stderr_tail = [line for line in tail if line]
        if self._stopping:
            return None
        # ffmpeg's last line names the cause; earlier lines repeat it with addresses.
        last = self.stderr_tail[-1] if self.stderr_tail else "no output"
        message = self._cut_reason or f"ffmpeg exited with code {code}: {last}"
        delay = self._backoff()
        self._set(RecorderState.RECONNECTING, message)
        detail = "\n".join(f"    ffmpeg: {line}" for line in self.stderr_tail)
        self.problems.failed(
            message,
            suffix=self._suffix(delay),
            detail=detail,
            key=comparison_key(message),
        )
        return delay
