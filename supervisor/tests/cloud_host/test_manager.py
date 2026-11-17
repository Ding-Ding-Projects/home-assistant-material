"""Test the cloud host state machine."""

from datetime import UTC, datetime
import json
from pathlib import Path

import pytest

from supervisor.cloud_host import (
    CloudHostManager,
    CloudHostState,
    NotInstalledTunnelRunner,
    validate_hostname,
)
from supervisor.exceptions import CloudHostInvalidHostnameError, CloudHostStateError

from .fakes import SIGN_IN_URL, FakeRunner

HOSTNAME = "ha.example.com"
NOW = datetime(2026, 11, 17, 12, 0, tzinfo=UTC)


def make_manager(
    tmp_path: Path, runner: FakeRunner | None = None, status: int | Exception = 200
) -> tuple[CloudHostManager, FakeRunner]:
    """Build a manager with a fake runner and a scripted outside check."""
    fake = runner or FakeRunner()

    async def fetch_status(url: str) -> int:
        if isinstance(status, Exception):
            raise status
        fetch_status.urls.append(url)  # type: ignore[attr-defined]
        return status

    fetch_status.urls = []  # type: ignore[attr-defined]
    manager = CloudHostManager(
        tmp_path / "cloud_host.json", fake, fetch_status, lambda: NOW
    )
    manager.fetch = fetch_status  # type: ignore[attr-defined]
    return manager, fake


@pytest.mark.parametrize(
    "value",
    [
        "",
        "localhost",
        "203.0.113.5",
        "1.2.3.4.5",
        "ha.example.com/path",
        "https://ha.example.com",
        "ha.example.com:8123",
        "ha example.com",
        "-bad.example.com",
        "bad-.example.com",
        "user@ha.example.com",
        "ha..example.com",
        "a" * 64 + ".example.com",
    ],
)
def test_validate_hostname_rejects(value: str) -> None:
    """Test anything that is not a plain DNS name is refused."""
    with pytest.raises(CloudHostInvalidHostnameError):
        validate_hostname(value)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("ha.example.com", "ha.example.com"),
        ("  HA.Example.COM. ", "ha.example.com"),
        ("my-home.sub.example.co.uk", "my-home.sub.example.co.uk"),
    ],
)
def test_validate_hostname_accepts(value: str, expected: str) -> None:
    """Test plain DNS names are accepted and normalized."""
    assert validate_hostname(value) == expected


async def test_initial_state(tmp_path: Path) -> None:
    """Test nothing is set up at first."""
    manager, _ = make_manager(tmp_path)

    info = await manager.info()

    assert info["state"] == CloudHostState.NOT_SET_UP
    assert info["hostname"] is None
    assert info["last_check"] is None
    assert await manager.sign_in_url() is None


async def test_full_lifecycle(tmp_path: Path) -> None:
    """Test setup, sign-in, pause, resume and remove."""
    manager, runner = make_manager(tmp_path)

    result = await manager.setup(HOSTNAME)
    assert result["state"] == CloudHostState.WAITING_FOR_SIGN_IN
    assert result["sign_in_url"] == SIGN_IN_URL
    assert await manager.sign_in_url() == SIGN_IN_URL
    assert not runner.running

    runner.signed_in = True
    info = await manager.info()
    assert info["state"] == CloudHostState.RUNNING
    assert runner.running
    assert await manager.sign_in_url() is None

    assert (await manager.pause())["state"] == CloudHostState.PAUSED
    assert not runner.running
    assert (await manager.info())["state"] == CloudHostState.PAUSED

    assert (await manager.resume())["state"] == CloudHostState.RUNNING
    assert runner.running

    removed = await manager.remove()
    assert removed["state"] == CloudHostState.NOT_SET_UP
    assert runner.removed
    assert (await manager.info())["hostname"] is None


async def test_state_survives_restart(tmp_path: Path) -> None:
    """Test a new manager reads the stored state."""
    manager, runner = make_manager(tmp_path)
    await manager.setup(HOSTNAME)
    runner.signed_in = True
    await manager.info()
    await manager.pause()

    again, _ = make_manager(tmp_path, runner)

    info = await again.info()
    assert info["state"] == CloudHostState.PAUSED
    assert info["hostname"] == HOSTNAME


async def test_stored_state_holds_no_credential_or_url(tmp_path: Path) -> None:
    """Test the stored file and the info never carry the sign-in URL."""
    manager, runner = make_manager(tmp_path)
    await manager.setup(HOSTNAME)
    runner.signed_in = True
    info = await manager.info()

    stored = (tmp_path / "cloud_host.json").read_text(encoding="utf-8")

    assert SIGN_IN_URL not in stored
    assert "token" not in stored
    assert "sign_in_url" not in info
    assert set(json.loads(stored)) <= {"hostname", "signed_in", "paused", "last_check"}


async def test_setup_invalid_hostname(tmp_path: Path) -> None:
    """Test setup refuses a hostname that is not a plain DNS name."""
    manager, _ = make_manager(tmp_path)

    with pytest.raises(CloudHostInvalidHostnameError):
        await manager.setup("203.0.113.5")

    assert (await manager.info())["state"] == CloudHostState.NOT_SET_UP


async def test_setup_twice_refused(tmp_path: Path) -> None:
    """Test a second setup needs the first one removed."""
    manager, _ = make_manager(tmp_path)
    await manager.setup(HOSTNAME)

    with pytest.raises(CloudHostStateError):
        await manager.setup("other.example.com")


@pytest.mark.parametrize("action", ["pause", "resume"])
async def test_actions_refused_when_not_set_up(tmp_path: Path, action: str) -> None:
    """Test pause and resume need a set up cloud host."""
    manager, _ = make_manager(tmp_path)

    with pytest.raises(CloudHostStateError):
        await getattr(manager, action)()


async def test_pause_refused_while_waiting(tmp_path: Path) -> None:
    """Test pause needs a running tunnel."""
    manager, _ = make_manager(tmp_path)
    await manager.setup(HOSTNAME)

    with pytest.raises(CloudHostStateError):
        await manager.pause()


async def test_setup_runner_failure_is_error_state(tmp_path: Path) -> None:
    """Test a failed sign-in start is reported as an error and can be removed."""
    runner = FakeRunner()
    runner.fail_on = {"begin_sign_in"}
    manager, _ = make_manager(tmp_path, runner)

    result = await manager.setup(HOSTNAME)

    assert result["state"] == CloudHostState.ERROR
    assert result["error"] == "begin_sign_in failed"
    assert result["sign_in_url"] is None
    assert (await manager.info())["state"] == CloudHostState.ERROR
    assert (await manager.remove())["state"] == CloudHostState.NOT_SET_UP


async def test_not_installed_runner(tmp_path: Path) -> None:
    """Test the placeholder runner reports why setup cannot work."""
    manager = CloudHostManager(
        tmp_path / "cloud_host.json", NotInstalledTunnelRunner(), _unused_fetch
    )

    result = await manager.setup(HOSTNAME)

    assert result["state"] == CloudHostState.ERROR
    assert result["error"] == "tunnel runner not installed"
    assert (await manager.remove())["state"] == CloudHostState.NOT_SET_UP


async def _unused_fetch(url: str) -> int:
    raise AssertionError("no outside check expected")


async def test_runner_stops_by_itself(tmp_path: Path) -> None:
    """Test a tunnel that is no longer running is shown as an error."""
    manager, runner = make_manager(tmp_path)
    await manager.setup(HOSTNAME)
    runner.signed_in = True
    await manager.info()
    runner.running = False

    info = await manager.info()

    assert info["state"] == CloudHostState.ERROR
    assert info["error"] == "tunnel is not running"
    assert (await manager.resume())["state"] == CloudHostState.RUNNING


async def test_remove_failure_still_ends_not_set_up(tmp_path: Path) -> None:
    """Test a failed cleanup never leaves the page stuck, and says what was left."""
    manager, runner = make_manager(tmp_path)
    await manager.setup(HOSTNAME)
    runner.fail_on = {"remove"}

    result = await manager.remove()

    assert result["state"] == CloudHostState.NOT_SET_UP
    assert result["hostname"] is None
    assert result["note"] == "remove failed"
    assert (await manager.info())["state"] == CloudHostState.NOT_SET_UP


async def test_error_then_remove_then_setup_again(tmp_path: Path) -> None:
    """Test an error is never a dead end: Remove clears it and Set up works again."""
    runner = FakeRunner()
    runner.fail_on = {"begin_sign_in"}
    manager, _ = make_manager(tmp_path, runner)
    assert (await manager.setup(HOSTNAME))["state"] == CloudHostState.ERROR

    assert (await manager.remove())["state"] == CloudHostState.NOT_SET_UP
    runner.fail_on = set()
    result = await manager.setup(HOSTNAME)

    assert result["state"] == CloudHostState.WAITING_FOR_SIGN_IN
    assert result["sign_in_url"] == SIGN_IN_URL


async def test_error_then_resume_restarts_sign_in(tmp_path: Path) -> None:
    """Test Resume from an error before sign-in tries the sign-in again."""
    runner = FakeRunner()
    runner.fail_on = {"begin_sign_in"}
    manager, _ = make_manager(tmp_path, runner)
    await manager.setup(HOSTNAME)
    runner.fail_on = set()

    result = await manager.resume()

    assert result["state"] == CloudHostState.WAITING_FOR_SIGN_IN
    assert await manager.sign_in_url() == SIGN_IN_URL


@pytest.mark.parametrize(
    ("status", "ok", "reported_status", "reason"),
    [
        (200, True, 200, None),
        (502, False, 502, None),
        (TimeoutError(), False, None, "TimeoutError"),
        (OSError("boom"), False, None, "OSError"),
    ],
)
async def test_check_records_status_and_time_only(
    tmp_path: Path,
    status: int | Exception,
    ok: bool,
    reported_status: int | None,
    reason: str | None,
) -> None:
    """Test one outside check records the status and time and nothing else."""
    manager, runner = make_manager(tmp_path, status=status)
    await manager.setup(HOSTNAME)
    runner.signed_in = True

    info = await manager.check()

    assert info["last_check"] == {
        "time": NOW.isoformat(),
        "ok": ok,
        "status": reported_status,
        "reason": reason,
    }
    assert (await manager.info())["last_check"] == info["last_check"]


async def test_check_requests_manifest_of_hostname(tmp_path: Path) -> None:
    """Test the check asks the configured hostname's manifest over HTTPS."""
    manager, _ = make_manager(tmp_path)
    await manager.setup(HOSTNAME)

    await manager.check()

    assert manager.fetch.urls == [f"https://{HOSTNAME}/manifest.json"]  # type: ignore[attr-defined]


async def test_check_refused_when_not_set_up(tmp_path: Path) -> None:
    """Test the check needs a hostname."""
    manager, _ = make_manager(tmp_path)

    with pytest.raises(CloudHostStateError):
        await manager.check()
