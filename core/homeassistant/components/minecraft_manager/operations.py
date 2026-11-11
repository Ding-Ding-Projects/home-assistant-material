"""Run server operations on an SSH Docker host.

Every function returns a plain dictionary: ``{"ok": True, ...}`` or
``{"ok": False, "code": "<stable code>"}``. Raw error text from the remote side
is never returned.
"""

import asyncio
from collections.abc import Awaitable, Callable
import re
from typing import Any

from . import commands
from .const import (
    COMMAND_TIMEOUT,
    EDITION_JAVA,
    LOG_REMOTE_BYTES,
    PULL_TIMEOUT,
    REACHABLE_POLL_SECONDS,
    REACHABLE_WAIT_SECONDS,
    RUN_TIMEOUT,
    STOP_TIMEOUT,
    TARGET_SSH_DOCKER,
)
from .hosts import HostDefinition
from .manager import MinecraftManager, ServerDefinition
from .ssh import (
    CommandResult,
    SshError,
    SshSession,
    async_open,
    async_tcp_reachable,
    is_lan_address,
)

Failure = dict[str, Any]

_ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]")
_VERSION_TEXT = re.compile(r"[0-9A-Za-z.+_\-]{1,40}")
_STATE_TEXT = re.compile(r"[a-z]{1,20}")
_TIME_TEXT = re.compile(r"[0-9TZ:.\-+]{1,40}")
_OWNER_TEXT = re.compile(r"[0-9a-f]{32}")

DOCKER_STATES = {
    "running": "running",
    "restarting": "starting",
    "created": "stopped",
    "exited": "stopped",
    "paused": "stopped",
    "dead": "stopped",
    "removing": "stopped",
}


def failure(code: str) -> Failure:
    """Return a failed result."""
    return {"ok": False, "code": code}


def clean_log_text(text: str) -> str:
    """Remove terminal colour codes and control characters from log text."""
    return _CONTROL.sub("", _ANSI.sub("", text.replace("\r\n", "\n")))


def parse_inspect(output: str) -> dict[str, str | None]:
    """Parse the ``state|started|health|owner`` line of ``docker inspect``.

    A state this manager does not know is an error, never "stopped".
    """
    parts = output.strip().split("|")
    status = parts[0] if parts and _STATE_TEXT.fullmatch(parts[0]) else ""
    if status not in DOCKER_STATES:
        raise commands.CommandError("command_failed")
    started = parts[1] if len(parts) > 1 and _TIME_TEXT.fullmatch(parts[1]) else None
    health = parts[2] if len(parts) > 2 and _STATE_TEXT.fullmatch(parts[2]) else None
    owner = parts[3] if len(parts) > 3 and _OWNER_TEXT.fullmatch(parts[3]) else None
    return {
        "owner": owner,
        "state": DOCKER_STATES[status],
        "started_at": started if started and not started.startswith("0001") else None,
        "health": health,
    }


async def _with_host[T](
    manager: MinecraftManager,
    host_id: str | None,
    action: Callable[[HostDefinition, SshSession], Awaitable[T]],
) -> T | Failure:
    host = manager.hosts.get(host_id) if host_id else None
    if host is None:
        return failure("unknown_host")
    try:
        key = await manager.hosts.async_load_key(host["id"])
        async with async_open(host, key) as session:
            return await action(host, session)
    except SshError as err:
        return failure(err.code)
    except commands.CommandError as err:
        return failure(err.code)


def _server_error(server: ServerDefinition) -> str | None:
    if server.get("target") != TARGET_SSH_DOCKER:
        return "target_not_supported"
    if server.get("edition") != EDITION_JAVA:
        return "edition_not_supported"
    if not server.get("host_id"):
        return "no_host"
    return None


def _command_failed(result: CommandResult) -> Failure:
    return failure(commands.classify_failure(result.exit_status, result.stderr))


async def async_test_host(
    manager: MinecraftManager, host_id: str
) -> dict[str, Any]:
    """Sign in and report the Docker version and whether docker can be used."""

    async def action(_host: HostDefinition, session: SshSession) -> dict[str, Any]:
        result = await session.run(commands.docker_version())
        if result.exit_status != 0:
            return _command_failed(result)
        version = result.stdout.strip()
        return {
            "ok": True,
            "docker_version": version if _VERSION_TEXT.fullmatch(version) else None,
            "address": session.peer_ip,
            "lan": is_lan_address(session.peer_ip),
        }

    return await _with_host(manager, host_id, action)


async def _status(
    server: ServerDefinition, session: SshSession
) -> dict[str, Any]:
    result = await session.run(commands.inspect(server["name"]))
    port = server["port"]
    if result.exit_status != 0:
        code = commands.classify_failure(result.exit_status, result.stderr)
        if code != "container_not_found":
            return failure(code)
        return {
            "ok": True,
            "state": "absent",
            "started_at": None,
            "health": None,
            "address": session.peer_ip,
            "port": port,
            "reachable": None,
        }
    info = parse_inspect(result.stdout)
    if info.pop("owner") != server["id"]:
        return failure("not_managed")
    reachable = None
    if info["state"] == "running":
        reachable = await async_tcp_reachable(session.peer_ip, port)
    return {
        "ok": True,
        **info,
        "address": session.peer_ip,
        "port": port,
        "reachable": reachable,
    }


async def async_status(
    manager: MinecraftManager, server: ServerDefinition
) -> dict[str, Any]:
    """Report the live state of a server container and its game port."""
    if (code := _server_error(server)) is not None:
        return failure(code)

    async def action(_host: HostDefinition, session: SshSession) -> dict[str, Any]:
        return await _status(server, session)

    return await _with_host(manager, server.get("host_id"), action)


async def _wait_reachable(address: str, port: int) -> bool:
    waited = 0
    while True:
        if await async_tcp_reachable(address, port):
            return True
        if waited >= REACHABLE_WAIT_SECONDS:
            return False
        await asyncio.sleep(REACHABLE_POLL_SECONDS)
        waited += REACHABLE_POLL_SECONDS


async def _volume_owner(
    server: ServerDefinition, session: SshSession
) -> Failure | str | None:
    """Return the owner label of the data volume, None when it is missing."""
    result = await session.run(commands.volume_inspect(server["name"]))
    if result.exit_status != 0:
        code = commands.classify_failure(result.exit_status, result.stderr)
        return None if code == "volume_not_found" else failure(code)
    return result.stdout.strip()


async def _ensure_volume(
    server: ServerDefinition, session: SshSession
) -> Failure | None:
    """Create the labelled data volume, or accept one this server already owns."""
    owner = await _volume_owner(server, session)
    if isinstance(owner, dict):
        return owner
    if owner is None:
        created = await session.run(
            commands.volume_create(server["name"], server["id"])
        )
        return _command_failed(created) if created.exit_status != 0 else None
    return None if owner == server["id"] else failure("not_managed")


async def async_start(
    manager: MinecraftManager, server: ServerDefinition
) -> dict[str, Any]:
    """Create or start the container, then check that the game port answers."""
    if (code := _server_error(server)) is not None:
        return failure(code)
    if not server.get("eula_accepted"):
        return failure("eula_required")

    async def action(_host: HostDefinition, session: SshSession) -> dict[str, Any]:
        if not is_lan_address(session.peer_ip):
            return failure("host_not_lan")
        current = await _status(server, session)
        if not current["ok"]:
            return current
        if current["state"] == "running":
            return {**current, "already_running": True}
        if current["state"] == "absent":
            if (problem := await _ensure_volume(server, session)) is not None:
                return problem
            image = commands.image_for_version(server.get("version"))
            present = await session.run(commands.image_inspect(image))
            if present.exit_status != 0:
                pulled = await session.run(
                    commands.image_pull(image), timeout=PULL_TIMEOUT
                )
                if pulled.exit_status != 0:
                    return _command_failed(pulled)
            started = await session.run(
                commands.run(dict(server), session.peer_ip), timeout=RUN_TIMEOUT
            )
        else:
            started = await session.run(
                commands.start_existing(server["name"]), timeout=RUN_TIMEOUT
            )
        if started.exit_status != 0:
            return _command_failed(started)
        reachable = await _wait_reachable(session.peer_ip, server["port"])
        return {
            "ok": True,
            "state": "running",
            "started_at": None,
            "health": None,
            "address": session.peer_ip,
            "port": server["port"],
            "reachable": reachable,
            "image": commands.image_for_version(server.get("version")),
        }

    async with manager.lock(server["id"]):
        return await _with_host(manager, server.get("host_id"), action)


async def _simple(
    manager: MinecraftManager,
    server: ServerDefinition,
    build: Callable[[str], list[str]],
    *,
    timeout: int,
    expect: str | None = None,
) -> dict[str, Any]:
    if (code := _server_error(server)) is not None:
        return failure(code)

    async def action(_host: HostDefinition, session: SshSession) -> dict[str, Any]:
        current = await _status(server, session)
        if not current["ok"]:
            return current
        if current["state"] == "absent":
            return failure("container_not_found")
        if expect is not None and current["state"] != expect:
            return failure(
                "still_running" if current["state"] == "running" else "not_running"
            )
        result = await session.run(build(server["name"]), timeout=timeout)
        if result.exit_status != 0:
            return _command_failed(result)
        return {"ok": True}

    async with manager.lock(server["id"]):
        return await _with_host(manager, server.get("host_id"), action)


async def async_stop(
    manager: MinecraftManager, server: ServerDefinition
) -> dict[str, Any]:
    """Stop the container. The world is saved by the game on the way out."""
    return await _simple(manager, server, commands.stop, timeout=STOP_TIMEOUT)


async def async_restart(
    manager: MinecraftManager, server: ServerDefinition
) -> dict[str, Any]:
    """Restart the container."""
    return await _simple(manager, server, commands.restart, timeout=STOP_TIMEOUT)


async def async_remove_container(
    manager: MinecraftManager, server: ServerDefinition
) -> dict[str, Any]:
    """Remove a stopped container. The data volume stays."""
    return await _simple(
        manager,
        server,
        commands.remove_container,
        timeout=COMMAND_TIMEOUT,
        expect="stopped",
    )


async def async_delete_data(
    manager: MinecraftManager, server: ServerDefinition
) -> dict[str, Any]:
    """Delete the data volume. The container must already be gone."""
    if (code := _server_error(server)) is not None:
        return failure(code)

    async def action(_host: HostDefinition, session: SshSession) -> dict[str, Any]:
        current = await _status(server, session)
        if not current["ok"]:
            return current
        if current["state"] != "absent":
            return failure("container_exists")
        owner = await _volume_owner(server, session)
        if isinstance(owner, dict):
            return owner
        if owner is None:
            return failure("volume_not_found")
        if owner != server["id"]:
            return failure("not_managed")
        result = await session.run(commands.remove_volume(server["name"]))
        if result.exit_status != 0:
            return _command_failed(result)
        return {"ok": True}

    async with manager.lock(server["id"]):
        return await _with_host(manager, server.get("host_id"), action)


async def async_logs(
    manager: MinecraftManager, server: ServerDefinition, lines: int
) -> dict[str, Any]:
    """Return the last lines of the container log."""
    if (code := _server_error(server)) is not None:
        return failure(code)

    async def action(_host: HostDefinition, session: SshSession) -> dict[str, Any]:
        result = await session.run(
            commands.logs(server["name"], lines), head_bytes=LOG_REMOTE_BYTES
        )
        if result.exit_status != 0:
            return failure(
                commands.classify_failure(result.exit_status, result.stdout)
            )
        text = clean_log_text(result.stdout)
        return {"ok": True, "lines": text.splitlines()[-lines:]}

    return await _with_host(manager, server.get("host_id"), action)


async def async_container_state(
    manager: MinecraftManager, server: ServerDefinition
) -> str | Failure:
    """Return ``absent`` or the state of the server's container.

    A container with the server's name that this manager did not create counts
    as present, because it would be affected by a rename or removal.
    """
    if server.get("target") != TARGET_SSH_DOCKER or not server.get("host_id"):
        return "absent"

    async def action(_host: HostDefinition, session: SshSession) -> str | Failure:
        result = await session.run(commands.inspect(server["name"]))
        if result.exit_status == 0:
            return "present"
        code = commands.classify_failure(result.exit_status, result.stderr)
        return "absent" if code == "container_not_found" else failure(code)

    return await _with_host(manager, server.get("host_id"), action)
