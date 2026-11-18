"""Record one camera around the clock into short MP4 segments with ffmpeg."""

import asyncio
from collections import deque
from collections.abc import Callable
from contextlib import suppress
from enum import StrEnum
import os
from pathlib import Path
import time

from homeassistant.components.camera import async_get_stream_source
from homeassistant.components.ffmpeg import get_ffmpeg_manager
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

STABLE_RUN_SECONDS = 120
STOP_TIMEOUT = 10


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
    binary: str, source: str, folder: Path, segment_seconds: int
) -> list[str]:
    """The ffmpeg command: video copied as it is, audio to AAC, one file per segment."""
    command = [binary, "-hide_banner", "-loglevel", "error", "-nostdin", "-y"]
    if source.startswith(("rtsp://", "rtsps://")):
        command += ["-rtsp_transport", "tcp"]
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
    ) -> None:
        """Set up the recorder. Nothing runs until start."""
        self.hass = hass
        self.entity_id = entity_id
        self.folder = folder
        self.segment_seconds = segment_seconds
        self._on_change = on_change
        self.state = RecorderState.STOPPED
        self.last_error: str | None = None
        self.no_source = False
        self.retry_at: float | None = None
        self.started_at: float | None = None
        self._task: asyncio.Task[None] | None = None
        self._process: asyncio.subprocess.Process | None = None
        self._stopping = False

    @property
    def running(self) -> bool:
        """Whether the recorder loop is active (recording or trying to)."""
        return self._task is not None and not self._task.done()

    def _set(self, state: RecorderState, error: str | None = None) -> None:
        self.state = state
        if error is not None:
            self.last_error = error
        self._on_change()

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

    async def _run(self) -> None:
        attempt = 0
        no_stream_attempt = 0
        limited_attempt = 0
        while not self._stopping:
            error: str | None = None
            try:
                source = await async_get_stream_source(self.hass, self.entity_id)
            except HomeAssistantError as err:
                source = None
                error = str(err)
                self.last_error = error
            if not source:
                self.no_source = error is None
                if is_rate_limited(error):
                    delay = wait_for_attempt(limited_attempt, RATE_LIMIT_WAIT_SECONDS)
                    limited_attempt += 1
                    self._set(RecorderState.LIMITED, error)
                else:
                    delay = wait_for_attempt(no_stream_attempt, NO_STREAM_WAIT_SECONDS)
                    no_stream_attempt += 1
                    self._set(
                        RecorderState.NO_STREAM,
                        error or "The camera does not offer a video stream",
                    )
                await self._wait(delay)
                continue
            self.no_source = False
            limited_attempt = 0
            no_stream_attempt = 0

            await self.hass.async_add_executor_job(
                lambda: self.folder.mkdir(parents=True, exist_ok=True)
            )
            command = build_command(
                get_ffmpeg_manager(self.hass).binary,
                source,
                self.folder,
                self.segment_seconds,
            )
            started = time.monotonic()
            try:
                self._process = await asyncio.create_subprocess_exec(
                    *command,
                    stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.PIPE,
                    env={**os.environ, "TZ": "UTC"},
                )
            except OSError as err:
                self._set(RecorderState.RECONNECTING, f"Could not start ffmpeg: {err}")
            else:
                self.started_at = time.time()
                self._set(RecorderState.RECORDING)
                tail: deque[str] = deque(maxlen=5)
                if self._process.stderr is not None:
                    async for line in self._process.stderr:
                        tail.append(line.decode(errors="replace").strip())
                code = await self._process.wait()
                self._process = None
                if self._stopping:
                    return
                # ffmpeg's last line names the cause; earlier lines repeat it with addresses.
                message = next(
                    (t for t in reversed(tail) if t), f"ffmpeg stopped with code {code}"
                )
                LOGGER.warning("Recording %s stopped: %s", self.entity_id, message)
                self._set(RecorderState.RECONNECTING, message)

            if time.monotonic() - started > STABLE_RUN_SECONDS:
                attempt = 0
            delay = RESTART_BACKOFF_SECONDS[
                min(attempt, len(RESTART_BACKOFF_SECONDS) - 1)
            ]
            attempt += 1
            await self._wait(delay)
