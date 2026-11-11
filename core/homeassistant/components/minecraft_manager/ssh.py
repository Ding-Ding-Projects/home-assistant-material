"""SSH access to a Docker host: key-only sign-in and trust on first use.

Nothing here logs or returns a private key, and no error text from the remote
side is passed on: failures are mapped to stable codes.
"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
import re
import secrets
import shlex
from typing import Any

import asyncssh

from .const import (
    COMMAND_TIMEOUT,
    LOG_MAX_CHARS,
    OUTPUT_CHUNK_BYTES,
    OUTPUT_MAX_BYTES,
    REACHABLE_CONNECT_TIMEOUT,
    SSH_CONNECT_TIMEOUT,
)
from .host_validation import is_lan_address

__all__ = [
    "CommandResult",
    "HostKeyInfo",
    "SshError",
    "SshSession",
    "async_open",
    "async_read_host_key",
    "async_tcp_reachable",
    "fingerprint_of",
    "host_key_file_hint",
    "is_lan_address",
]

# Everything that could make a connection do more than sign in and run one
# command is switched off, and the instance user's own OpenSSH configuration
# is never read: a "Hostname" or "ProxyCommand" line in it would otherwise
# redirect the connection or run a local program.
_HARDENED_OPTIONS: dict[str, Any] = {
    "config": [],
    "agent_forwarding": False,
    "x11_forwarding": False,
    "send_env": [],
    "env": None,
}

_KEY_FILE_TYPES = (
    ("ssh-ed25519", "ed25519"),
    ("ssh-rsa", "rsa"),
    ("rsa-sha2", "rsa"),
    ("ecdsa-sha2", "ecdsa"),
    ("ssh-dss", "dsa"),
)


class SshError(Exception):
    """A connection or command failed. The code is stable; there is no text."""

    def __init__(self, code: str) -> None:
        """Keep the stable error code."""
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class HostKeyInfo:
    """The public host key a machine presented."""

    fingerprint: str
    key_line: str
    algorithm: str = ""


@dataclass(frozen=True)
class CommandResult:
    """The outcome of one remote command."""

    exit_status: int | None
    stdout: str
    stderr: str
    truncated: bool = False


def fingerprint_of(key: asyncssh.SSHKey) -> str:
    """Return the SHA-256 fingerprint, such as ``SHA256:abc...``."""
    return key.get_fingerprint("sha256")


def host_key_file_hint(algorithm: str) -> str | None:
    """Return the key type used in ``/etc/ssh/ssh_host_<type>_key.pub``."""
    for prefix, file_type in _KEY_FILE_TYPES:
        if algorithm.startswith(prefix):
            return file_type
    return None


async def async_read_host_key(address: str, port: int) -> HostKeyInfo:
    """Read the host key without signing in, so the person can confirm it."""
    try:
        async with asyncio.timeout(SSH_CONNECT_TIMEOUT):
            key = await asyncssh.get_server_host_key(address, port, config=[])
    except TimeoutError as err:
        raise SshError("timeout") from err
    except (OSError, asyncssh.Error) as err:
        raise SshError("connect_failed") from err
    if key is None:
        raise SshError("no_host_key")
    return HostKeyInfo(
        fingerprint=fingerprint_of(key),
        key_line=key.export_public_key("openssh").decode().strip(),
        algorithm=key.get_algorithm(),
    )


async def _read_capped(stream: Any, limit: int, on_full: Any) -> tuple[bytes, bool]:
    """Read a stream in small chunks, keeping at most ``limit`` bytes."""
    data = bytearray()
    while True:
        chunk = await stream.read(OUTPUT_CHUNK_BYTES)
        if not chunk:
            return bytes(data), False
        data += chunk[: limit - len(data)]
        if len(data) >= limit:
            on_full()
            return bytes(data), True


def _decode(data: bytes) -> str:
    return data.decode("utf-8", errors="replace")[:LOG_MAX_CHARS]


def _split_marker(
    text: bytes, marker: str, fallback: int | None
) -> tuple[int | None, bytes]:
    """Remove the exit marker from the end of the output and read its status."""
    pattern = re.compile(
        rb"\n?" + re.escape(marker.encode()) + rb"([0-9]{1,3})\n?\Z"
    )
    found = pattern.search(text)
    if found is None:
        # The marker was cut off: the output was longer than the remote cap.
        return fallback, text
    return int(found.group(1)), text[: found.start()]


class SshSession:
    """One signed-in connection to a host."""

    def __init__(self, conn: asyncssh.SSHClientConnection, peer_ip: str) -> None:
        """Keep the connection and the address it reached."""
        self._conn = conn
        self.peer_ip = peer_ip

    async def run(
        self,
        argv: list[str],
        *,
        timeout: int = COMMAND_TIMEOUT,
        merge_stderr: bool = False,
        head_bytes: int | None = None,
    ) -> CommandResult:
        """Run an argument list, quoted for the remote shell.

        Output is read in bounded chunks and the channel is closed as soon as
        either stream reaches the cap, so a hostile or runaway command never
        costs memory beyond it. With ``head_bytes`` the output is also cut on
        the remote side, and the real exit status travels in a marker that
        follows the output.
        """
        command = shlex.join(argv)
        marker = ""
        if merge_stderr or head_bytes is not None:
            command += " 2>&1"
        if head_bytes is not None:
            marker = f"__exit_{secrets.token_hex(8)}_"
            command = (
                f"{{ {command}; printf '\\n{marker}%s\\n' \"$?\"; }}"
                f" | head -c {int(head_bytes)}"
            )
        try:
            async with asyncio.timeout(timeout):
                process = await self._conn.create_process(
                    command, stdin=asyncssh.DEVNULL, encoding=None
                )
                try:
                    return await self._collect(process, marker)
                finally:
                    process.close()
        except TimeoutError as err:
            raise SshError("timeout") from err
        except (OSError, asyncssh.Error) as err:
            raise SshError("connect_failed") from err

    async def _collect(self, process: Any, marker: str) -> CommandResult:
        full = asyncio.Event()

        def stop() -> None:
            full.set()
            process.close()

        try:
            (out, out_cut), (err, err_cut) = await asyncio.gather(
                _read_capped(process.stdout, OUTPUT_MAX_BYTES, stop),
                _read_capped(process.stderr, OUTPUT_MAX_BYTES, stop),
            )
        except (OSError, asyncssh.Error):
            if not full.is_set():
                raise
            # The channel was closed on purpose once a stream reached its cap.
            return CommandResult(None, "", "", truncated=True)
        truncated = out_cut or err_cut
        exit_status: int | None = None
        if not truncated:
            try:
                async with asyncio.timeout(SSH_CONNECT_TIMEOUT):
                    await process.wait_closed()
            except TimeoutError:
                pass
            exit_status = process.exit_status
        if marker:
            exit_status, out = _split_marker(out, marker, exit_status)
        return CommandResult(exit_status, _decode(out), _decode(err), truncated)


@asynccontextmanager
async def async_open(
    host: dict[str, Any], client_key: asyncssh.SSHKey
) -> AsyncIterator[SshSession]:
    """Sign in with the instance's key, trusting only the stored host key."""
    stored = host.get("host_key")
    if not stored:
        raise SshError("host_key_untrusted")
    try:
        trusted = asyncssh.import_public_key(stored["key"])
    except (asyncssh.KeyImportError, KeyError, TypeError, ValueError) as err:
        raise SshError("host_key_invalid") from err
    try:
        async with asyncio.timeout(SSH_CONNECT_TIMEOUT * 2):
            conn = await asyncssh.connect(
                host["address"],
                host["port"],
                username=host["user"],
                client_keys=[client_key],
                known_hosts=([trusted], [], []),
                password=None,
                passphrase=None,
                agent_path=None,
                public_key_auth=True,
                password_auth=False,
                kbdint_auth=False,
                gss_auth=False,
                connect_timeout=SSH_CONNECT_TIMEOUT,
                login_timeout=SSH_CONNECT_TIMEOUT,
                **_HARDENED_OPTIONS,
            )
    except asyncssh.HostKeyNotVerifiable as err:
        raise SshError("host_key_changed") from err
    except asyncssh.PermissionDenied as err:
        raise SshError("auth_failed") from err
    except asyncssh.KeyExchangeFailed as err:
        # A machine that offers only another key type cannot be matched to the
        # trusted key. Look at what it offers, so a replaced key is reported as
        # a changed key and not as a plain connection failure.
        raise SshError(await _key_exchange_failure(host, stored)) from err
    except TimeoutError as err:
        raise SshError("timeout") from err
    except (OSError, asyncssh.Error) as err:
        raise SshError("connect_failed") from err
    try:
        peer = conn.get_extra_info("peername")
        yield SshSession(conn, str(peer[0]) if peer else host["address"])
    finally:
        conn.close()
        await conn.wait_closed()


async def _key_exchange_failure(host: dict[str, Any], stored: dict[str, Any]) -> str:
    try:
        offered = await async_read_host_key(host["address"], host["port"])
    except SshError:
        return "connect_failed"
    if offered.fingerprint != stored.get("fingerprint"):
        return "host_key_changed"
    return "connect_failed"


async def async_tcp_reachable(address: str, port: int) -> bool:
    """Return True when a TCP connection to the game port succeeds."""
    try:
        async with asyncio.timeout(REACHABLE_CONNECT_TIMEOUT):
            _, writer = await asyncio.open_connection(address, port)
    except (TimeoutError, OSError):
        return False
    writer.close()
    try:
        await writer.wait_closed()
    except OSError:
        pass
    return True
