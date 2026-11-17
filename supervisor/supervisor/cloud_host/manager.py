"""Cloud host state machine."""

import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
import json
import logging
import os
from pathlib import Path
from typing import Any

from ..const import ATTR_HOSTNAME, ATTR_STATE
from ..exceptions import (
    CloudHostInvalidHostnameError,
    CloudHostRunnerError,
    CloudHostStateError,
)
from .const import (
    ATTR_CHECK_OK,
    ATTR_CHECK_REASON,
    ATTR_CHECK_STATUS,
    ATTR_CHECK_TIME,
    ATTR_ERROR,
    ATTR_LAST_CHECK,
    ATTR_PAUSED,
    ATTR_SIGN_IN_URL,
    MANIFEST_PATH,
    RE_HOSTNAME,
    CloudHostState,
)
from .runner import TunnelRunner

_LOGGER: logging.Logger = logging.getLogger(__name__)

ATTR_SIGNED_IN = "signed_in"

# Returns the HTTP status of one HTTPS GET of the URL, raising on no answer
FetchStatus = Callable[[str], Awaitable[int]]


def validate_hostname(value: str) -> str:
    """Return the lowercase hostname or raise when it is not a plain DNS name."""
    if not isinstance(value, str):
        raise CloudHostInvalidHostnameError()
    hostname = value.strip().lower().rstrip(".")
    if not RE_HOSTNAME.match(hostname):
        raise CloudHostInvalidHostnameError()
    return hostname


class CloudHostManager:
    """Keeps the cloud host state and drives the tunnel runner."""

    def __init__(
        self,
        state_file: Path,
        runner: TunnelRunner,
        fetch_status: FetchStatus,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        """Initialize."""
        self._state_file = state_file
        self._runner = runner
        self._fetch_status = fetch_status
        self._now = now
        self._lock = asyncio.Lock()
        self._data: dict[str, Any] | None = None
        self._sign_in_url: str | None = None

    async def _load(self) -> dict[str, Any]:
        if self._data is None:
            self._data = await asyncio.to_thread(self._read_file)
        return self._data

    def _read_file(self) -> dict[str, Any]:
        try:
            loaded = json.loads(self._state_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        return loaded if isinstance(loaded, dict) else {}

    def _write_file(self, data: dict[str, Any]) -> None:
        temp = self._state_file.with_suffix(".tmp")
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle)
        temp.replace(self._state_file)

    async def _save(self, data: dict[str, Any]) -> None:
        self._data = data
        await asyncio.to_thread(self._write_file, data)

    async def _fail(self, data: dict[str, Any], err: CloudHostRunnerError) -> None:
        reason = str(err) or "tunnel runner failed"
        _LOGGER.warning("Cloud host runner failed: %s", reason)
        data[ATTR_ERROR] = reason
        await self._save(data)

    async def _refresh(self, data: dict[str, Any]) -> CloudHostState:
        """Work out the current state, picking up a finished sign-in on the way."""
        if not data.get(ATTR_HOSTNAME):
            return CloudHostState.NOT_SET_UP
        if data.get(ATTR_ERROR):
            return CloudHostState.ERROR

        try:
            if not data.get(ATTR_SIGNED_IN):
                if not await self._runner.sign_in_complete():
                    return CloudHostState.WAITING_FOR_SIGN_IN
                data[ATTR_SIGNED_IN] = True
                self._sign_in_url = None
                if not data.get(ATTR_PAUSED):
                    await self._runner.start(data[ATTR_HOSTNAME])
                await self._save(data)

            if data.get(ATTR_PAUSED):
                return CloudHostState.PAUSED
            if not await self._runner.is_running():
                data[ATTR_ERROR] = "tunnel is not running"
                return CloudHostState.ERROR
        except CloudHostRunnerError as err:
            await self._fail(data, err)
            return CloudHostState.ERROR
        return CloudHostState.RUNNING

    async def info(self) -> dict[str, Any]:
        """Return the state for the API. Never contains a credential."""
        async with self._lock:
            data = await self._load()
            state = await self._refresh(data)
            return self._describe(data, state)

    def _describe(self, data: dict[str, Any], state: CloudHostState) -> dict[str, Any]:
        return {
            ATTR_STATE: state,
            ATTR_HOSTNAME: data.get(ATTR_HOSTNAME),
            ATTR_ERROR: data.get(ATTR_ERROR) if state == CloudHostState.ERROR else None,
            ATTR_LAST_CHECK: data.get(ATTR_LAST_CHECK),
        }

    async def sign_in_url(self) -> str | None:
        """Return the pending sign-in URL, if one is waiting."""
        async with self._lock:
            data = await self._load()
            state = await self._refresh(data)
            if state != CloudHostState.WAITING_FOR_SIGN_IN:
                return None
            return self._sign_in_url

    async def setup(self, hostname: str) -> dict[str, Any]:
        """Start the sign-in for a new hostname. Returns the state and the URL."""
        hostname = validate_hostname(hostname)
        async with self._lock:
            data = await self._load()
            state = await self._refresh(data)
            if state != CloudHostState.NOT_SET_UP:
                raise CloudHostStateError(state=state)

            data = {ATTR_HOSTNAME: hostname, ATTR_SIGNED_IN: False, ATTR_PAUSED: False}
            try:
                self._sign_in_url = await self._runner.begin_sign_in(hostname)
            except CloudHostRunnerError as err:
                self._sign_in_url = None
                await self._fail(data, err)
                return {
                    **self._describe(data, CloudHostState.ERROR),
                    ATTR_SIGN_IN_URL: None,
                }
            await self._save(data)
            return {
                **self._describe(data, CloudHostState.WAITING_FOR_SIGN_IN),
                ATTR_SIGN_IN_URL: self._sign_in_url,
            }

    async def pause(self) -> dict[str, Any]:
        """Stop serving but keep the sign-in."""
        async with self._lock:
            data = await self._load()
            state = await self._refresh(data)
            if state != CloudHostState.RUNNING:
                raise CloudHostStateError(state=state)
            try:
                await self._runner.stop()
            except CloudHostRunnerError as err:
                await self._fail(data, err)
                return self._describe(data, CloudHostState.ERROR)
            data[ATTR_PAUSED] = True
            await self._save(data)
            return self._describe(data, CloudHostState.PAUSED)

    async def resume(self) -> dict[str, Any]:
        """Serve again after a pause, or retry after an error."""
        async with self._lock:
            data = await self._load()
            state = await self._refresh(data)
            if state not in (CloudHostState.PAUSED, CloudHostState.ERROR):
                raise CloudHostStateError(state=state)
            data.pop(ATTR_ERROR, None)
            if not data.get(ATTR_SIGNED_IN):
                await self._save(data)
                return self._describe(data, CloudHostState.WAITING_FOR_SIGN_IN)
            try:
                await self._runner.start(data[ATTR_HOSTNAME])
            except CloudHostRunnerError as err:
                await self._fail(data, err)
                return self._describe(data, CloudHostState.ERROR)
            data[ATTR_PAUSED] = False
            await self._save(data)
            return self._describe(data, CloudHostState.RUNNING)

    async def remove(self) -> dict[str, Any]:
        """Stop, delete the credential and forget the hostname."""
        async with self._lock:
            data = await self._load()
            if data.get(ATTR_HOSTNAME):
                try:
                    await self._runner.remove()
                except CloudHostRunnerError as err:
                    # Keep the setup so the removal can be tried again
                    await self._fail(data, err)
                    return self._describe(data, CloudHostState.ERROR)
            self._sign_in_url = None
            await self._save({})
            return self._describe({}, CloudHostState.NOT_SET_UP)

    async def check(self) -> dict[str, Any]:
        """Make one HTTPS request to the hostname and record the result."""
        async with self._lock:
            data = await self._load()
            hostname = data.get(ATTR_HOSTNAME)
            if not hostname:
                raise CloudHostStateError(state=CloudHostState.NOT_SET_UP)

            result: dict[str, Any] = {ATTR_CHECK_TIME: self._now().isoformat()}
            try:
                status = await self._fetch_status(f"https://{hostname}{MANIFEST_PATH}")
            except Exception as err:  # noqa: BLE001 - any client failure means no answer
                result |= {
                    ATTR_CHECK_OK: False,
                    ATTR_CHECK_STATUS: None,
                    ATTR_CHECK_REASON: type(err).__name__,
                }
            else:
                result |= {
                    ATTR_CHECK_OK: status == 200,
                    ATTR_CHECK_STATUS: status,
                    ATTR_CHECK_REASON: None,
                }
            data[ATTR_LAST_CHECK] = result
            await self._save(data)
            state = await self._refresh(data)
            return self._describe(data, state)
