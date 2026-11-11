"""SSH access to a Docker host: key-only sign-in and trust on first use.

Nothing here logs or returns a private key, and no error text from the remote
side is passed on: failures are mapped to stable codes.
"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
import ipaddress
import shlex
from typing import Any

import asyncssh

from .const import (
    COMMAND_TIMEOUT,
    LOG_MAX_CHARS,
    REACHABLE_CONNECT_TIMEOUT,
    SSH_CONNECT_TIMEOUT,
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


@dataclass(frozen=True)
class CommandResult:
    """The outcome of one remote command."""

    exit_status: int | None
    stdout: str
    stderr: str


def fingerprint_of(key: asyncssh.SSHKey) -> str:
    """Return the SHA-256 fingerprint, such as ``SHA256:abc...``."""
    return key.get_fingerprint("sha256")


async def async_read_host_key(address: str, port: int) -> HostKeyInfo:
    """Read the host key without signing in, so the person can confirm it."""
    try:
        async with asyncio.timeout(SSH_CONNECT_TIMEOUT):
            key = await asyncssh.get_server_host_key(address, port)
    except TimeoutError as err:
        raise SshError("timeout") from err
    except (OSError, asyncssh.Error) as err:
        raise SshError("connect_failed") from err
    if key is None:
        raise SshError("no_host_key")
    return HostKeyInfo(
        fingerprint=fingerprint_of(key),
        key_line=key.export_public_key("openssh").decode().strip(),
    )


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
    ) -> CommandResult:
        """Run an argument list, quoted for the remote shell."""
        command = shlex.join(argv)
        if merge_stderr:
            command += " 2>&1"
        try:
            async with asyncio.timeout(timeout):
                result = await self._conn.run(
                    command, check=False, encoding="utf-8", errors="replace"
                )
        except TimeoutError as err:
            raise SshError("timeout") from err
        except (OSError, asyncssh.Error) as err:
            raise SshError("connect_failed") from err
        return CommandResult(
            result.exit_status,
            str(result.stdout or "")[:LOG_MAX_CHARS],
            str(result.stderr or "")[:LOG_MAX_CHARS],
        )


@asynccontextmanager
async def async_open(
    host: dict[str, Any], client_key: asyncssh.SSHKey
) -> AsyncIterator[SshSession]:
    """Sign in with the instance's key, trusting only the stored host key."""
    stored = host.get("host_key")
    if not stored:
        raise SshError("host_key_untrusted")
    trusted = asyncssh.import_public_key(stored["key"])
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
            )
    except asyncssh.HostKeyNotVerifiable as err:
        raise SshError("host_key_changed") from err
    except asyncssh.PermissionDenied as err:
        raise SshError("auth_failed") from err
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


def is_lan_address(value: str) -> bool:
    """Return True for a private, loopback or link-local address."""
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    return address.is_private or address.is_loopback or address.is_link_local


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
