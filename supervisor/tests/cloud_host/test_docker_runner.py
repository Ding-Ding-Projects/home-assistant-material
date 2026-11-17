"""Test the Docker tunnel runner against a fake Docker interface."""

import asyncio
from pathlib import Path, PurePath
from types import SimpleNamespace
from typing import Any

import aiodocker
import pytest

from supervisor.cloud_host import docker_runner
from supervisor.cloud_host.const import (
    CLIENT_CERT_FILE,
    LOGIN_DOCKER_NAME,
    TUNNEL_DOCKER_NAME,
)
from supervisor.cloud_host.docker_runner import (
    DockerTunnelRunner,
    delete_command,
    parse_sign_in_url,
    route_command,
    run_tunnel_command,
    tunnel_name,
    valid_sign_in_url,
)
from supervisor.docker.manager import CommandReturn
from supervisor.exceptions import CloudHostRunnerError, DockerError, DockerNotFound

HOSTNAME = "ha.example.com"
ORIGIN = "http://172.30.32.1:8123"
SECRET_MARK = "SECRET-FILE-CONTENT"
CREDENTIAL = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0.json"

# The client's output: a sentence, a blank line, the address, a blank line, a sentence
LOGIN_LINES = [
    "Please open the following URL and log in with your Cloudflare account:",
    "",
    "https://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Flogin.example%2Fcb",
    "",
    "Leave cloudflared running to download the cert automatically.",
]


class FakeContainer:
    """Container handle with an inspect result."""

    def __init__(self, docker: "FakeDocker", name: str) -> None:
        """Initialize."""
        self._docker = docker
        self._name = name

    async def show(self) -> dict[str, Any]:
        """Return inspect data or raise 404."""
        if self._name not in self._docker.running:
            raise aiodocker.DockerError(404, {"message": "no such container"})
        return {
            "State": {"Running": True},
            "NetworkSettings": {"Networks": {"hassio": {"IPAddress": "172.30.32.7"}}},
        }


class FakeDocker:
    """Records calls like the parts of DockerAPI the runner uses."""

    def __init__(self) -> None:
        """Initialize."""
        self.network = SimpleNamespace(name="hassio")
        self.images = SimpleNamespace(inspect=self._inspect, pull=self._pull)
        self.containers = SimpleNamespace(
            container=lambda name: FakeContainer(self, name)
        )
        self.has_image = True
        self.pulled: list[str] = []
        self.running: set[str] = set()
        self.runs: list[dict[str, Any]] = []
        self.commands: list[list[str]] = []
        self.stopped: list[str] = []
        self.logs: list[str] = list(LOGIN_LINES)
        self.exit_codes: dict[str, int] = {}
        self.data_dir: Path | None = None
        self.raise_on_run: Exception | None = None
        self.stop_error: Exception | None = None

    async def _inspect(self, image: str) -> dict:
        if not self.has_image:
            raise aiodocker.DockerError(404, {"message": "no such image"})
        return {}

    async def _pull(self, image: str, tag: str) -> None:
        self.pulled.append(f"{image}:{tag}")
        self.has_image = True

    async def run(self, image: str, *, name: str, **kwargs: Any) -> dict:
        """Record a long-running container."""
        if self.raise_on_run:
            raise self.raise_on_run
        self.runs.append({"image": image, "name": name, **kwargs})
        self.running.add(name)
        return {}

    async def run_command(
        self, image: str, command: list[str], tag: str, **kwargs: Any
    ) -> CommandReturn:
        """Record a one-shot command and act like the client for create."""
        self.commands.append(command)
        if command[1] == "create" and self.data_dir:
            await asyncio.to_thread(
                (self.data_dir / CREDENTIAL).write_text, SECRET_MARK
            )
        return CommandReturn(self.exit_codes.get(command[1], 0), [])

    async def stop_container(
        self, name: str, timeout: int, remove_container: bool = True
    ) -> None:
        """Record a stop; like the real interface, a missing container is not found."""
        self.stopped.append(name)
        if self.stop_error:
            raise self.stop_error
        if name not in self.running:
            raise DockerNotFound()
        self.running.discard(name)

    async def container_logs(self, name: str, tail: int = 100) -> list[str]:
        """Return the canned output; a missing container is not found, as in the real one."""
        if name not in self.running:
            raise DockerNotFound()
        return self.logs


@pytest.fixture(name="docker")
def fixture_docker(tmp_path: Path) -> FakeDocker:
    """Return a fake Docker interface."""
    fake = FakeDocker()
    fake.data_dir = tmp_path / "data"
    return fake


@pytest.fixture(name="runner")
def fixture_runner(docker: FakeDocker, tmp_path: Path) -> DockerTunnelRunner:
    """Return a runner on the fake Docker interface."""
    assert docker.data_dir
    return DockerTunnelRunner(
        docker,  # type: ignore[arg-type]
        docker.data_dir,
        PurePath("/mnt/data/cloud_host_tunnel"),
        lambda: ORIGIN,
        poll_seconds=0,
    )


def _sign_in(data_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / CLIENT_CERT_FILE).write_text(SECRET_MARK)


def test_parse_real_line_shape() -> None:
    """The address is found on its own line among the client's sentences."""
    assert parse_sign_in_url(LOGIN_LINES) == LOGIN_LINES[2]


@pytest.mark.parametrize(
    "url",
    [
        "http://dash.cloudflare.com/argotunnel?x=1",
        "https://evil.example.net/argotunnel?x=1",
        "https://dash.cloudflare.com.evil.net/x",
        "https://user:pw@dash.cloudflare.com/x",
        "https://dash.cloudflare.com:8443/x",
        "ftp://dash.cloudflare.com/x",
    ],
)
def test_refuse_non_provider_address(url: str) -> None:
    """Only https on the provider's own login domain is accepted."""
    assert not valid_sign_in_url(url)
    assert parse_sign_in_url(["open this", url]) is None


async def test_begin_sign_in_returns_only_the_address(
    runner: DockerTunnelRunner, docker: FakeDocker
) -> None:
    """Sign-in starts a port-free container with a private folder and returns the address."""
    docker.has_image = False
    url = await runner.begin_sign_in(HOSTNAME)

    assert url == LOGIN_LINES[2]
    assert docker.pulled == ["cloudflare/cloudflared:2025.11.1"]
    run = docker.runs[0]
    assert run["name"] == LOGIN_DOCKER_NAME
    assert run["command"] == ["tunnel", "login"]
    assert "ports" not in run
    assert not run.get("privileged")
    assert run["mounts"][0].source == "/mnt/data/cloud_host_tunnel"
    assert docker.data_dir
    assert docker.data_dir.stat().st_mode & 0o777 == 0o700


async def test_begin_sign_in_refuses_wrong_domain(
    runner: DockerTunnelRunner, docker: FakeDocker
) -> None:
    """A foreign address is never returned, and the login container is stopped."""
    docker.logs = ["https://evil.example.net/login"]
    runner._poll_seconds = 0  # noqa: SLF001
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(docker_runner, "SIGN_IN_TIMEOUT_SECONDS", 0)
        with pytest.raises(CloudHostRunnerError) as err:
            await runner.begin_sign_in(HOSTNAME)
    assert "evil" not in str(err.value)
    assert LOGIN_DOCKER_NAME in docker.stopped


async def test_begin_sign_in_rejects_bad_hostname(runner: DockerTunnelRunner) -> None:
    """The hostname is validated again before anything runs."""
    with pytest.raises(CloudHostRunnerError):
        await runner.begin_sign_in("ha.example.com; rm -rf /")


async def test_sign_in_complete_detects_cert_without_reading_it(
    runner: DockerTunnelRunner, docker: FakeDocker
) -> None:
    """Completion is an existence check, and the waiting container is removed."""
    assert docker.data_dir
    assert await runner.sign_in_complete() is False
    _sign_in(docker.data_dir)

    assert await runner.sign_in_complete() is True
    assert LOGIN_DOCKER_NAME in docker.stopped


async def test_start_builds_fixed_commands(
    runner: DockerTunnelRunner, docker: FakeDocker
) -> None:
    """Start creates, routes and runs with fixed arguments and a pinned address."""
    assert docker.data_dir
    _sign_in(docker.data_dir)
    name = tunnel_name(HOSTNAME)

    await runner.start(HOSTNAME)

    assert docker.commands == [
        ["tunnel", "create", name],
        ["tunnel", "route", "dns", name, HOSTNAME],
    ]
    run = docker.runs[-1]
    assert run["name"] == TUNNEL_DOCKER_NAME
    assert run["command"] == run_tunnel_command(name, ORIGIN)
    assert run["restart_policy"] == {"Name": "always"}
    assert str(run["ipv4"]) == "172.30.32.7"
    assert "ports" not in run
    assert await runner.is_running() is True
    assert await runner.trusted_proxy() == "172.30.32.7"


async def test_start_reuses_existing_credential(
    runner: DockerTunnelRunner, docker: FakeDocker
) -> None:
    """A tunnel that already has a credential is not created again."""
    assert docker.data_dir
    _sign_in(docker.data_dir)
    (docker.data_dir / CREDENTIAL).write_text(SECRET_MARK)

    await runner.start(HOSTNAME)

    assert [c[1] for c in docker.commands] == ["route"]


@pytest.mark.parametrize("step", ["create", "route"])
async def test_start_failure_reasons_hold_no_secrets(
    runner: DockerTunnelRunner, docker: FakeDocker, step: str
) -> None:
    """A failed step becomes a short fixed reason."""
    assert docker.data_dir
    _sign_in(docker.data_dir)
    docker.exit_codes[step] = 1

    with pytest.raises(CloudHostRunnerError) as err:
        await runner.start(HOSTNAME)

    assert SECRET_MARK not in str(err.value)
    assert HOSTNAME not in str(err.value)
    assert not docker.runs


async def test_start_requires_sign_in(runner: DockerTunnelRunner) -> None:
    """Without the credential nothing is started."""
    with pytest.raises(CloudHostRunnerError):
        await runner.start(HOSTNAME)


async def test_start_run_failure(
    runner: DockerTunnelRunner, docker: FakeDocker
) -> None:
    """A container that cannot start is reported without Docker details."""
    assert docker.data_dir
    _sign_in(docker.data_dir)
    docker.raise_on_run = DockerError("secret path /x")

    with pytest.raises(CloudHostRunnerError) as err:
        await runner.start(HOSTNAME)

    assert "/x" not in str(err.value)


async def test_start_refuses_odd_core_address(
    docker: FakeDocker,
) -> None:
    """The origin must be a plain address."""
    assert docker.data_dir
    _sign_in(docker.data_dir)
    odd = DockerTunnelRunner(
        docker,  # type: ignore[arg-type]
        docker.data_dir,
        PurePath("/x"),
        lambda: "http://x; reboot",
        poll_seconds=0,
    )
    with pytest.raises(CloudHostRunnerError):
        await odd.start(HOSTNAME)


def test_https_origin_adds_verify_flag() -> None:
    """An https origin on an address cannot verify its certificate."""
    command = run_tunnel_command("ham-0000000000000000", "https://172.30.32.1:8123")
    assert "--no-tls-verify" in command
    assert command[-1] == "ham-0000000000000000"


def test_command_shapes() -> None:
    """Commands are fixed arguments plus validated values."""
    assert route_command("n", HOSTNAME) == ["tunnel", "route", "dns", "n", HOSTNAME]
    assert delete_command("n") == ["tunnel", "delete", "-f", "n"]


async def test_stop_and_is_running(
    runner: DockerTunnelRunner, docker: FakeDocker
) -> None:
    """Stop removes the tunnel container."""
    docker.running.add(TUNNEL_DOCKER_NAME)
    assert await runner.is_running() is True

    await runner.stop()

    assert await runner.is_running() is False
    assert await runner.trusted_proxy() is None


async def test_remove_deletes_folder_and_tries_provider(
    runner: DockerTunnelRunner, docker: FakeDocker
) -> None:
    """Remove stops containers, deletes the tunnel best effort and the folder."""
    assert docker.data_dir
    _sign_in(docker.data_dir)
    await runner.start(HOSTNAME)
    docker.commands.clear()
    docker.exit_codes["delete"] = 1  # provider deletion failing must not stop removal

    await runner.remove()

    assert docker.commands == [delete_command(tunnel_name(HOSTNAME))]
    assert not docker.data_dir.exists()
    assert not docker.running


async def test_info_reports_trusted_proxy_only_when_running(tmp_path: Path) -> None:
    """The manager adds trusted_proxy to info only while running."""
    from supervisor.cloud_host import CloudHostManager

    from tests.cloud_host.fakes import FakeRunner

    class ProxyRunner(FakeRunner):
        async def trusted_proxy(self) -> str | None:
            return "172.30.32.7"

    fake = ProxyRunner()
    manager = CloudHostManager(tmp_path / "state.json", fake, lambda _: None)  # type: ignore[arg-type]
    assert "trusted_proxy" not in await manager.info()

    await manager.setup(HOSTNAME)
    fake.signed_in = True
    info = await manager.info()
    assert info["state"] == "running"
    assert info["trusted_proxy"] == "172.30.32.7"


async def test_stop_of_missing_container_is_success(
    runner: DockerTunnelRunner, docker: FakeDocker
) -> None:
    """A container that was never created is already stopped."""
    await runner.stop()

    assert docker.stopped == [TUNNEL_DOCKER_NAME]


async def test_real_stop_failure_of_existing_container_is_error(
    runner: DockerTunnelRunner, docker: FakeDocker
) -> None:
    """Only a real stop failure is an error."""
    docker.running.add(TUNNEL_DOCKER_NAME)
    docker.stop_error = DockerError("daemon said no")

    with pytest.raises(CloudHostRunnerError) as err:
        await runner.stop()

    assert "daemon" not in str(err.value)


async def test_remove_with_nothing_created_is_clean(
    runner: DockerTunnelRunner, docker: FakeDocker
) -> None:
    """Remove on a fresh instance succeeds with no note."""
    assert await runner.remove() is None


async def test_remove_reports_leftovers_without_raising(
    runner: DockerTunnelRunner, docker: FakeDocker
) -> None:
    """A failing stop becomes a note, and the folder is still deleted."""
    assert docker.data_dir
    _sign_in(docker.data_dir)
    docker.running.add(TUNNEL_DOCKER_NAME)
    docker.stop_error = DockerError("x")

    note = await runner.remove()

    assert note == "a container could not be stopped"
    assert not docker.data_dir.exists()


async def test_real_sequence_setup_then_remove(
    runner: DockerTunnelRunner, docker: FakeDocker, tmp_path: Path
) -> None:
    """Fresh instance: Set up reaches waiting_for_sign_in, Remove reaches not_set_up."""
    from supervisor.cloud_host import CloudHostManager, CloudHostState

    docker.has_image = False
    manager = CloudHostManager(tmp_path / "state.json", runner, lambda _: None)  # type: ignore[arg-type]

    result = await manager.setup(HOSTNAME)

    assert result["state"] == CloudHostState.WAITING_FOR_SIGN_IN
    assert result["sign_in_url"] == LOGIN_LINES[2]
    assert docker.pulled == ["cloudflare/cloudflared:2025.11.1"]

    removed = await manager.remove()

    assert removed["state"] == CloudHostState.NOT_SET_UP
    assert "note" not in removed
    assert not docker.running
    assert (await manager.info())["state"] == CloudHostState.NOT_SET_UP
