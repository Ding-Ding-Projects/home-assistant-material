"""Tests of the SSH Docker target against a throwaway in-process SSH server."""

import asyncio
from collections.abc import AsyncGenerator
import json
import os
from pathlib import Path
import shlex
import stat
from typing import Any

import asyncssh
import pytest

from homeassistant.components.minecraft_manager import hosts, operations, ssh

SERVER: dict[str, Any] = {
    "id": "b" * 32,
    "name": "Family survival",
    "edition": "java",
    "flavour": "paper",
    "version": "1.21.4",
    "port": 25565,
    "memory_mb": 2048,
    "target": "ssh_docker",
    "host_id": "a" * 32,
    "eula_accepted": True,
}


class FakeDocker:
    """A tiny stand-in for the Docker command line on the remote host."""

    def __init__(self) -> None:
        self.containers: dict[str, dict[str, Any]] = {}
        self.commands: list[list[str]] = []
        self.listeners: list[asyncio.Server] = []

    async def handle(self, process: asyncssh.SSHServerProcess) -> None:
        argv = shlex.split(process.command.replace(" 2>&1", ""))
        self.commands.append(argv)
        match argv[:2]:
            case ["docker", "version"]:
                process.stdout.write("27.3.1\n")
                process.exit(0)
            case ["docker", "image"]:
                process.stderr.write("Error: No such image\n")
                process.exit(1)
            case ["docker", "pull"]:
                process.exit(0)
            case ["docker", "run"]:
                name = argv[argv.index("--name") + 1]
                address, port, _ = argv[argv.index("--publish") + 1].split(":")
                listener = await asyncio.start_server(
                    lambda _r, writer: writer.close(), address, int(port)
                )
                self.listeners.append(listener)
                self.containers[name] = {"state": "running", "argv": argv}
                process.stdout.write("abcdef\n")
                process.exit(0)
            case ["docker", "inspect"]:
                container = self.containers.get(argv[-1])
                if container is None:
                    process.stderr.write(f"Error: No such object: {argv[-1]}\n")
                    process.exit(1)
                else:
                    process.stdout.write(f"{container['state']}|2026-11-10T10:00:00Z|\n")
                    process.exit(0)
            case ["docker", "logs"]:
                process.stdout.write("\x1b[32mDone\x1b[0m\nsecond\n")
                process.exit(0)
            case ["docker", "stop"]:
                self.containers[argv[-1]]["state"] = "exited"
                process.exit(0)
            case _:
                process.stderr.write("bash: command not found\n")
                process.exit(127)


class StubManager:
    """The parts of the manager that the operations read."""

    def __init__(self, host: dict[str, Any], key: asyncssh.SSHKey) -> None:
        self._host = host
        self._key = key
        self._locks: dict[str, asyncio.Lock] = {}
        self.hosts = self

    def get(self, host_id: str) -> dict[str, Any] | None:
        return self._host if host_id == self._host["id"] else None

    async def async_load_key(self, host_id: str) -> asyncssh.SSHKey:
        return self._key

    def lock(self, server_id: str) -> asyncio.Lock:
        return self._locks.setdefault(server_id, asyncio.Lock())


@pytest.fixture
def client_key() -> asyncssh.SSHKey:
    """Return the key pair the instance holds for the host."""
    return asyncssh.generate_private_key("ssh-ed25519")


@pytest.fixture
async def docker_host(
    tmp_path: Path, client_key: asyncssh.SSHKey
) -> AsyncGenerator[tuple[FakeDocker, int, asyncssh.SSHKey]]:
    """Run an SSH server that only accepts the instance's key."""
    authorized = tmp_path / "authorized_keys"
    authorized.write_bytes(client_key.export_public_key("openssh"))
    host_key = asyncssh.generate_private_key("ssh-ed25519")
    docker = FakeDocker()
    server = await asyncssh.listen(
        "127.0.0.1",
        0,
        server_host_keys=[host_key],
        authorized_client_keys=str(authorized),
        process_factory=docker.handle,
        password_auth=False,
        kbdint_auth=False,
    )
    yield docker, server.sockets[0].getsockname()[1], host_key
    server.close()
    for listener in docker.listeners:
        listener.close()


async def _free_port() -> int:
    probe = await asyncio.start_server(lambda _r, w: w.close(), "127.0.0.1", 0)
    port = probe.sockets[0].getsockname()[1]
    probe.close()
    await probe.wait_closed()
    return port


async def _trusted_manager(
    port: int, client_key: asyncssh.SSHKey
) -> tuple[StubManager, dict[str, Any]]:
    info = await ssh.async_read_host_key("127.0.0.1", port)
    host: dict[str, Any] = {
        "id": "a" * 32,
        "name": "t",
        "address": "127.0.0.1",
        "port": port,
        "user": "tester",
        "host_key": {"fingerprint": info.fingerprint, "key": info.key_line},
    }
    return StubManager(host, client_key), host


async def test_untrusted_host_is_refused(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """Without a confirmed host key nothing signs in."""
    _, port, _ = docker_host
    host: dict[str, Any] = {
        "id": "a" * 32, "name": "t", "address": "127.0.0.1",
        "port": port, "user": "tester", "host_key": None,
    }
    result = await operations.async_test_host(StubManager(host, client_key), host["id"])
    assert result == {"ok": False, "code": "host_key_untrusted"}


async def test_changed_host_key_is_refused(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
    tmp_path: Path,
) -> None:
    """A different key on the same stored host is refused with its own code."""
    _, port, _ = docker_host
    manager, host = await _trusted_manager(port, client_key)
    other = asyncssh.generate_private_key("ssh-ed25519")
    host["host_key"] = {
        "fingerprint": ssh.fingerprint_of(other),
        "key": other.export_public_key("openssh").decode().strip(),
    }
    result = await operations.async_test_host(manager, host["id"])
    assert result == {"ok": False, "code": "host_key_changed"}


async def test_unknown_client_key_is_refused(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """The server only accepts the generated key."""
    _, port, _ = docker_host
    _, host = await _trusted_manager(port, client_key)
    stranger = StubManager(host, asyncssh.generate_private_key("ssh-ed25519"))
    result = await operations.async_test_host(stranger, host["id"])
    assert result == {"ok": False, "code": "auth_failed"}


async def test_start_stop_logs_and_status(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """A server starts on the LAN address, answers, stops and reports its log."""
    docker, port, _ = docker_host
    manager, _ = await _trusted_manager(port, client_key)
    server = {**SERVER, "port": await _free_port()}

    tested = await operations.async_test_host(manager, "a" * 32)
    assert tested["docker_version"] == "27.3.1"

    started = await operations.async_start(manager, server)
    assert started["ok"]
    assert started["reachable"] is True
    run = docker.containers["mc-family-survival"]["argv"]
    assert f"127.0.0.1:{server['port']}:25565/tcp" in run

    status = await operations.async_status(manager, server)
    assert status["state"] == "running"
    assert status["address"] == "127.0.0.1"

    logs = await operations.async_logs(manager, server, 50)
    assert logs == {"ok": True, "lines": ["Done", "second"]}

    assert await operations.async_remove_container(manager, server) == {
        "ok": False,
        "code": "still_running",
    }
    assert await operations.async_stop(manager, server) == {"ok": True}


async def test_start_requires_the_eula(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """Nothing is run before the person accepted the EULA."""
    docker, port, _ = docker_host
    manager, _ = await _trusted_manager(port, client_key)
    result = await operations.async_start(manager, {**SERVER, "eula_accepted": False})
    assert result == {"ok": False, "code": "eula_required"}
    assert docker.commands == []


async def test_unsupported_target_and_edition(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """Only a Java server on the SSH Docker target can start in this slice."""
    _, port, _ = docker_host
    manager, _ = await _trusted_manager(port, client_key)
    other_target = await operations.async_start(manager, {**SERVER, "target": "local_process"})
    assert other_target["code"] == "target_not_supported"
    bedrock = await operations.async_start(manager, {**SERVER, "edition": "bedrock"})
    assert bedrock["code"] == "edition_not_supported"


def test_key_file_permissions_and_no_overwrite(tmp_path: Path) -> None:
    """A private key is written for the owner only and never replaced."""
    key = asyncssh.generate_private_key("ssh-ed25519")
    directory = str(tmp_path / "keys")
    path = hosts.write_key_file(directory, "k.key", key.export_private_key("openssh"))
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    assert stat.S_IMODE(os.stat(directory).st_mode) == 0o700
    with pytest.raises(FileExistsError):
        hosts.write_key_file(directory, "k.key", b"other")
    os.chmod(path, 0o644)
    hosts.read_key_file(path)
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600


def test_public_view_never_holds_private_material() -> None:
    """The view sent to the interface has only public fields."""
    key = asyncssh.generate_private_key("ssh-ed25519")
    host: hosts.HostDefinition = {
        "id": "a" * 32,
        "name": "t",
        "address": "10.0.0.5",
        "port": 22,
        "user": "docker",
        "public_key": key.export_public_key("openssh").decode().strip(),
        "host_key": {"fingerprint": "SHA256:x", "key": "ssh-ed25519 AAAA"},
    }
    text = json.dumps(hosts.public_view(host))
    assert "PRIVATE KEY" not in text
    assert key.export_private_key("openssh").decode()[40:80] not in text
    assert set(hosts.public_view(host)) == {
        "id", "name", "address", "port", "user", "public_key", "host_key_fingerprint",
    }


def test_fingerprint_format() -> None:
    """The confirmed fingerprint is a SHA-256 fingerprint."""
    key = asyncssh.generate_private_key("ssh-ed25519")
    assert ssh.fingerprint_of(key).startswith("SHA256:")
