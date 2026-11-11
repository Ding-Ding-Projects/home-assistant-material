"""Tests of the SSH Docker target against a throwaway in-process SSH server."""

import asyncio
from collections.abc import AsyncGenerator
import json
import os
from pathlib import Path
import re
import shlex
import stat
from types import SimpleNamespace
from typing import Any

import asyncssh
import pytest

from homeassistant.components.minecraft_manager import hosts, operations, ssh
from homeassistant.components.minecraft_manager.const import (
    LOG_MAX_CHARS,
)

# These tests run a real SSH server on the loopback address.
pytestmark = pytest.mark.usefixtures("socket_enabled")

SERVER_ID = "b" * 32
OTHER_ID = "c" * 32
SERVER: dict[str, Any] = {
    "id": SERVER_ID,
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
CONTAINER = "mc-family-survival"
VOLUME = "mc-family-survival-data"

_WRAPPED = re.compile(
    r"\{ (?P<inner>.*); printf '\\n(?P<marker>__exit_[0-9a-f]+_)%s\\n' \"\$\?\"; \}"
    r" \| head -c (?P<limit>[0-9]+)"
)


class FakeDocker:
    """A tiny stand-in for the Docker command line on the remote host."""

    def __init__(self) -> None:
        self.containers: dict[str, dict[str, Any]] = {}
        self.volumes: dict[str, str] = {}
        self.commands: list[list[str]] = []
        self.listeners: list[asyncio.Server] = []
        self.log_text = "\x1b[32mDone\x1b[0m\nsecond\n"
        self.inspect_state: str | None = None
        self.endless_written = 0

    def _run(self, argv: list[str]) -> tuple[str, str, int]:
        match argv[:2]:
            case ["docker", "version"]:
                return "27.3.1\n", "", 0
            case ["docker", "image"]:
                return "", "Error: No such image\n", 1
            case ["docker", "pull"]:
                return "", "", 0
            case ["docker", "inspect"]:
                container = self.containers.get(argv[-1])
                if container is None:
                    return "", f"Error: No such object: {argv[-1]}\n", 1
                state = self.inspect_state or container["state"]
                return f"{state}|2026-11-10T10:00:00Z||{container['owner']}\n", "", 0
            case ["docker", "logs"]:
                if argv[-1] not in self.containers:
                    return "", f"Error: No such container: {argv[-1]}\n", 1
                return self.log_text, "", 0
            case ["docker", "stop"]:
                self.containers[argv[-1]]["state"] = "exited"
                return "", "", 0
            case ["docker", "rm"]:
                if self.containers.pop(argv[-1], None) is None:
                    return "", f"Error: No such container: {argv[-1]}\n", 1
                return "", "", 0
            case ["docker", "volume"]:
                return self._volume(argv)
        return "", "bash: command not found\n", 127

    def _volume(self, argv: list[str]) -> tuple[str, str, int]:
        name = argv[-1]
        match argv[2]:
            case "inspect":
                if name not in self.volumes:
                    return "", f"Error: No such volume: {name}\n", 1
                return f"{self.volumes[name]}\n", "", 0
            case "create":
                label = argv[argv.index("--label") + 1]
                self.volumes[name] = label.split("=", 1)[1]
                return f"{name}\n", "", 0
            case "rm":
                if self.volumes.pop(name, None) is None:
                    return "", f"Error: No such volume: {name}\n", 1
                return "", "", 0
        return "", "bash: command not found\n", 127

    async def handle(self, process: asyncssh.SSHServerProcess) -> None:
        command = process.command
        wrapped = _WRAPPED.fullmatch(command)
        suffix = ""
        limit: int | None = None
        if wrapped:
            command = wrapped["inner"]
            suffix = f"\n{wrapped['marker']}"
            limit = int(wrapped["limit"])
        argv = shlex.split(command.replace(" 2>&1", ""))
        self.commands.append(argv)
        if argv == ["docker", "endless"]:
            await self._endless(process)
            return
        if argv[:2] == ["docker", "run"]:
            self._start(argv)
            process.stdout.write("abcdef\n")
            process.exit(0)
            return
        stdout, stderr, status = self._run(argv)
        if wrapped:
            stdout = (stdout + stderr + suffix + f"{status}\n")[:limit]
            stderr, status = "", 0
        process.stdout.write(stdout)
        process.stderr.write(stderr)
        process.exit(status)

    def _start(self, argv: list[str]) -> None:
        name = argv[argv.index("--name") + 1]
        self.containers[name] = {
            "state": "running",
            "argv": argv,
            "owner": argv[argv.index("--label") + 1].split("=", 1)[1],
        }

    async def _endless(self, process: asyncssh.SSHServerProcess) -> None:
        chunk = "x" * 1_048_576
        try:
            for _ in range(200):
                process.stdout.write(chunk)
                await process.stdout.drain()
                self.endless_written += len(chunk)
        except (BrokenPipeError, ConnectionError, asyncssh.Error):
            return
        process.exit(0)


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


async def _listen(
    tmp_path: Path, client_key: asyncssh.SSHKey, host_keys: list[asyncssh.SSHKey]
) -> tuple[FakeDocker, asyncssh.SSHAcceptor]:
    authorized = tmp_path / "authorized_keys"
    authorized.write_bytes(client_key.export_public_key("openssh"))
    docker = FakeDocker()
    server = await asyncssh.listen(
        "127.0.0.1",
        0,
        server_host_keys=host_keys,
        authorized_client_keys=str(authorized),
        process_factory=docker.handle,
        password_auth=False,
        kbdint_auth=False,
    )
    return docker, server


@pytest.fixture
async def docker_host(
    tmp_path: Path, client_key: asyncssh.SSHKey
) -> AsyncGenerator[tuple[FakeDocker, int, asyncssh.SSHKey]]:
    """Run an SSH server that only accepts the instance's key."""
    host_key = asyncssh.generate_private_key("ssh-ed25519")
    docker, server = await _listen(tmp_path, client_key, [host_key])
    yield docker, server.sockets[0].getsockname()[1], host_key
    server.close()
    for listener in docker.listeners:
        listener.close()


@pytest.fixture
async def rsa_only_host(
    tmp_path: Path, client_key: asyncssh.SSHKey
) -> AsyncGenerator[int]:
    """Run an SSH server that offers an RSA host key only."""
    _, server = await _listen(
        tmp_path, client_key, [asyncssh.generate_private_key("ssh-rsa", key_size=2048)]
    )
    yield server.sockets[0].getsockname()[1]
    server.close()


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


async def _started(
    docker: FakeDocker, port: int, client_key: asyncssh.SSHKey
) -> tuple[StubManager, dict[str, Any]]:
    """Return a manager and a server whose container is running."""
    manager, _ = await _trusted_manager(port, client_key)
    server = {**SERVER, "port": await _free_port()}
    listener = await asyncio.start_server(
        lambda _r, writer: writer.close(), "127.0.0.1", server["port"]
    )
    docker.listeners.append(listener)
    result = await operations.async_start(manager, server)
    assert result["ok"]
    return manager, server


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


async def test_host_offering_only_another_key_type_is_a_changed_key(
    rsa_only_host: int, client_key: asyncssh.SSHKey
) -> None:
    """A trusted ed25519 key and a machine that now offers only RSA is a warning."""
    _, host = await _trusted_manager(rsa_only_host, client_key)
    trusted = asyncssh.generate_private_key("ssh-ed25519")
    host["host_key"] = {
        "fingerprint": ssh.fingerprint_of(trusted),
        "key": trusted.export_public_key("openssh").decode().strip(),
    }
    result = await operations.async_test_host(
        StubManager(host, client_key), host["id"]
    )
    assert result == {"ok": False, "code": "host_key_changed"}


async def test_damaged_stored_host_key_is_a_stable_error(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """A stored key line that cannot be read never raises out of the session."""
    _, port, _ = docker_host
    manager, host = await _trusted_manager(port, client_key)
    host["host_key"]["key"] = "ssh-ed25519 not-base64!!"
    result = await operations.async_test_host(manager, host["id"])
    assert result == {"ok": False, "code": "host_key_invalid"}


async def test_probe_reports_the_key_type(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
) -> None:
    """The probe names the algorithm and the matching host key file type."""
    _, port, host_key = docker_host
    info = await ssh.async_read_host_key("127.0.0.1", port)
    assert info.algorithm == "ssh-ed25519"
    assert info.fingerprint == ssh.fingerprint_of(host_key)
    assert ssh.host_key_file_hint(info.algorithm) == "ed25519"


async def test_probe_of_an_rsa_host_names_rsa(rsa_only_host: int) -> None:
    """A machine with an RSA key only is not described as ed25519."""
    info = await ssh.async_read_host_key("127.0.0.1", rsa_only_host)
    assert ssh.host_key_file_hint(info.algorithm) == "rsa"


@pytest.mark.parametrize(
    ("algorithm", "file_type"),
    [
        ("ssh-ed25519", "ed25519"),
        ("ssh-rsa", "rsa"),
        ("rsa-sha2-512", "rsa"),
        ("ecdsa-sha2-nistp256", "ecdsa"),
        ("something-new", None),
    ],
)
def test_host_key_file_hint(algorithm: str, file_type: str | None) -> None:
    """Each key type maps to the file name part under /etc/ssh."""
    assert ssh.host_key_file_hint(algorithm) == file_type


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


async def test_user_ssh_config_is_never_read(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A Hostname redirect in the user's own ssh config does not move the connection."""
    _, port, _ = docker_host
    manager, host = await _trusted_manager(port, client_key)
    home = tmp_path / "home"
    (home / ".ssh").mkdir(parents=True)
    (home / ".ssh" / "config").write_text(
        "Host *\n  Hostname 192.0.2.1\n  Port 1\n  ProxyCommand false\n"
    )
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))
    result = await operations.async_test_host(manager, host["id"])
    assert result["ok"]
    assert result["address"] == "127.0.0.1"
    info = await ssh.async_read_host_key("127.0.0.1", port)
    assert info.fingerprint == host["host_key"]["fingerprint"]


async def test_output_is_bounded_while_it_streams(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """A command that never ends is cut at the cap and its channel is closed."""
    docker, port, _ = docker_host
    manager, host = await _trusted_manager(port, client_key)
    async with ssh.async_open(host, client_key) as session:
        result = await session.run(["docker", "endless"], timeout=20)
    assert result.truncated
    assert len(result.stdout) <= LOG_MAX_CHARS
    assert result.exit_status is None
    # The server stopped writing long before it reached its own 200 MiB limit.
    assert docker.endless_written < 10 * 1_048_576


async def test_huge_single_line_log_is_cut_remotely(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """One enormous log line without a newline stays inside the cap."""
    docker, port, _ = docker_host
    manager, _ = await _started(docker, port, client_key)
    server = {**SERVER}
    docker.log_text = "y" * 5_000_000
    logs = await operations.async_logs(manager, server, 50)
    assert logs["ok"]
    assert sum(len(line) for line in logs["lines"]) <= LOG_MAX_CHARS
    wrapped = [c for c in docker.commands if c[:2] == ["docker", "logs"]]
    assert wrapped


async def test_start_stop_logs_and_status(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """A server starts on the LAN address, answers, stops and reports its log."""
    docker, port, _ = docker_host
    manager, _ = await _trusted_manager(port, client_key)
    server = {**SERVER, "port": await _free_port()}
    listener = await asyncio.start_server(
        lambda _r, writer: writer.close(), "127.0.0.1", server["port"]
    )
    docker.listeners.append(listener)

    tested = await operations.async_test_host(manager, "a" * 32)
    assert tested["docker_version"] == "27.3.1"

    started = await operations.async_start(manager, server)
    assert started["ok"]
    assert started["reachable"] is True
    run = docker.containers[CONTAINER]["argv"]
    assert f"127.0.0.1:{server['port']}:25565/tcp" in run
    assert docker.volumes[VOLUME] == SERVER_ID

    status = await operations.async_status(manager, server)
    assert status["state"] == "running"
    assert status["address"] == "127.0.0.1"
    assert "owner" not in status

    logs = await operations.async_logs(manager, server, 50)
    assert logs == {"ok": True, "lines": ["Done", "second"]}

    assert await operations.async_remove_container(manager, server) == {
        "ok": False,
        "code": "still_running",
    }
    assert await operations.async_stop(manager, server) == {"ok": True}


async def test_full_round_trip_with_removal_and_data_delete(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """Start, stop, remove the container, then delete the data, in that order."""
    docker, port, _ = docker_host
    manager, server = await _started(docker, port, client_key)

    assert await operations.async_delete_data(manager, server) == {
        "ok": False,
        "code": "container_exists",
    }
    assert await operations.async_stop(manager, server) == {"ok": True}
    assert await operations.async_delete_data(manager, server) == {
        "ok": False,
        "code": "container_exists",
    }
    assert await operations.async_remove_container(manager, server) == {"ok": True}
    assert CONTAINER not in docker.containers
    assert VOLUME in docker.volumes

    status = await operations.async_status(manager, server)
    assert status["state"] == "absent"
    assert await operations.async_remove_container(manager, server) == {
        "ok": False,
        "code": "container_not_found",
    }

    assert await operations.async_delete_data(manager, server) == {"ok": True}
    assert VOLUME not in docker.volumes
    assert await operations.async_delete_data(manager, server) == {
        "ok": False,
        "code": "volume_not_found",
    }


async def test_the_start_after_a_remove_reuses_the_owned_volume(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """The world volume of the same server is adopted again, not recreated."""
    docker, port, _ = docker_host
    manager, server = await _started(docker, port, client_key)
    await operations.async_stop(manager, server)
    await operations.async_remove_container(manager, server)
    creates = [c for c in docker.commands if c[:3] == ["docker", "volume", "create"]]
    assert len(creates) == 1
    again = await operations.async_start(manager, server)
    assert again["ok"]
    creates = [c for c in docker.commands if c[:3] == ["docker", "volume", "create"]]
    assert len(creates) == 1


async def test_foreign_container_is_never_touched(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """A container with the same name that another owner made is refused."""
    docker, port, _ = docker_host
    manager, _ = await _trusted_manager(port, client_key)
    docker.containers[CONTAINER] = {"state": "exited", "argv": [], "owner": OTHER_ID}
    server = {**SERVER, "port": await _free_port()}
    for call in (
        operations.async_start(manager, server),
        operations.async_status(manager, server),
        operations.async_stop(manager, server),
        operations.async_restart(manager, server),
        operations.async_remove_container(manager, server),
        operations.async_delete_data(manager, server),
    ):
        assert await call == {"ok": False, "code": "not_managed"}
    assert CONTAINER in docker.containers
    assert docker.containers[CONTAINER]["state"] == "exited"
    forbidden = {"run", "start", "stop", "restart", "rm"}
    assert not [c for c in docker.commands if len(c) > 1 and c[1] in forbidden]


async def test_container_without_a_label_is_foreign(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """A container this manager never labelled is not adopted."""
    docker, port, _ = docker_host
    manager, _ = await _trusted_manager(port, client_key)
    docker.containers[CONTAINER] = {"state": "running", "argv": [], "owner": ""}
    result = await operations.async_stop(manager, {**SERVER})
    assert result == {"ok": False, "code": "not_managed"}


@pytest.mark.parametrize("owner", [OTHER_ID, ""], ids=["other-server", "no-label"])
async def test_foreign_volume_is_never_used_or_deleted(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
    owner: str,
) -> None:
    """A pre-existing volume of that name is neither started on nor removed."""
    docker, port, _ = docker_host
    manager, _ = await _trusted_manager(port, client_key)
    docker.volumes[VOLUME] = owner
    server = {**SERVER, "port": await _free_port()}
    assert await operations.async_start(manager, server) == {
        "ok": False,
        "code": "not_managed",
    }
    assert await operations.async_delete_data(manager, server) == {
        "ok": False,
        "code": "not_managed",
    }
    assert VOLUME in docker.volumes
    assert not [c for c in docker.commands if c[:2] == ["docker", "run"]]
    assert not [c for c in docker.commands if c[:3] == ["docker", "volume", "rm"]]


async def test_unknown_container_state_is_a_failure(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """A state this manager does not know is never read as stopped."""
    docker, port, _ = docker_host
    manager, server = await _started(docker, port, client_key)
    docker.inspect_state = "mystery"
    assert await operations.async_status(manager, server) == {
        "ok": False,
        "code": "command_failed",
    }
    assert await operations.async_remove_container(manager, server) == {
        "ok": False,
        "code": "command_failed",
    }


async def test_container_state_helper(
    docker_host: tuple[FakeDocker, int, asyncssh.SSHKey],
    client_key: asyncssh.SSHKey,
) -> None:
    """The check used by rename and delete sees a container of any owner."""
    docker, port, _ = docker_host
    manager, _ = await _trusted_manager(port, client_key)
    assert await operations.async_container_state(manager, {**SERVER}) == "absent"
    docker.containers[CONTAINER] = {"state": "exited", "argv": [], "owner": OTHER_ID}
    assert await operations.async_container_state(manager, {**SERVER}) == "present"
    unreachable = {**SERVER, "host_id": "d" * 32}
    assert await operations.async_container_state(manager, unreachable) == {
        "ok": False,
        "code": "unknown_host",
    }


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


def test_parse_inspect_refuses_an_unknown_state() -> None:
    """The line of docker inspect must name a known state."""
    parsed = operations.parse_inspect(f"running|2026-11-10T10:00:00Z|healthy|{SERVER_ID}")
    assert parsed == {
        "owner": SERVER_ID,
        "state": "running",
        "started_at": "2026-11-10T10:00:00Z",
        "health": "healthy",
    }
    for text in ("", "mystery|x||", "|||"):
        with pytest.raises(operations.commands.CommandError) as error:
            operations.parse_inspect(text)
        assert error.value.code == "command_failed"


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


def test_key_file_on_a_mount_without_permissions_is_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When owner-only cannot be set, the key is removed and the error is clear."""
    monkeypatch.setattr(hosts, "_is_owner_only", lambda _path: False)
    directory = str(tmp_path / "keys")
    with pytest.raises(hosts.KeyStorageError) as error:
        hosts.write_key_file(directory, "k.key", b"secret")
    assert error.value.code == "key_permissions"
    assert not os.path.exists(os.path.join(directory, "k.key"))


def test_reading_a_key_that_cannot_be_tightened_is_a_clear_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A key on a mount where chmod does nothing is not passed through."""
    key = asyncssh.generate_private_key("ssh-ed25519")
    path = tmp_path / "k.key"
    path.write_bytes(key.export_private_key("openssh"))
    monkeypatch.setattr(hosts, "_is_owner_only", lambda _path: False)
    with pytest.raises(ssh.SshError) as error:
        hosts.read_key_file(str(path))
    assert error.value.code == "key_permissions"


def test_reading_a_missing_key_is_key_missing(tmp_path: Path) -> None:
    """A deleted key file is reported as missing."""
    with pytest.raises(ssh.SshError) as error:
        hosts.read_key_file(str(tmp_path / "none.key"))
    assert error.value.code == "key_missing"


class _FailingStore:
    """A store whose save always fails."""

    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        pass

    async def async_save(self, _data: Any) -> None:
        raise OSError("disk full")


class _FakeHass:
    """The two members of the core object the host store uses."""

    def __init__(self, base: Path) -> None:
        self.config = SimpleNamespace(path=lambda *parts: os.path.join(base, *parts))

    async def async_add_executor_job(self, function: Any, *args: Any) -> Any:
        return function(*args)


async def test_failed_save_leaves_no_key_file_behind(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When the record cannot be saved the new key file is removed again."""
    monkeypatch.setattr(hosts, "Store", _FailingStore)
    monkeypatch.setattr(hosts, "_is_owner_only", lambda _path: True)
    store = hosts.HostStore(_FakeHass(tmp_path))  # type: ignore[arg-type]
    with pytest.raises(OSError):
        await store.async_create(
            {"name": "t", "address": "10.0.0.5", "port": 22, "user": "docker"}
        )
    assert store.hosts() == []
    assert list(Path(store.keys_directory).iterdir()) == []


async def test_failed_save_keeps_the_key_of_a_host_that_is_not_removed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A host stays complete when removing it could not be saved."""
    monkeypatch.setattr(hosts, "Store", _FailingStore)
    monkeypatch.setattr(hosts, "_is_owner_only", lambda _path: True)
    store = hosts.HostStore(_FakeHass(tmp_path))  # type: ignore[arg-type]
    key = asyncssh.generate_private_key("ssh-ed25519")
    host: Any = {
        "id": "e" * 32, "name": "t", "address": "10.0.0.5", "port": 22,
        "user": "docker", "public_key": "x", "host_key": None,
    }
    store._hosts[host["id"]] = host
    hosts.write_key_file(
        store.keys_directory, f"{host['id']}.key", key.export_private_key("openssh")
    )
    with pytest.raises(OSError):
        await store.async_remove(host["id"])
    assert store.get(host["id"]) is host
    assert os.path.exists(store.key_path(host["id"]))


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
