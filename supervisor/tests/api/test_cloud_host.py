"""Test the cloud host API."""

from pathlib import Path
from unittest.mock import PropertyMock, patch

from aiohttp.test_utils import TestClient
import pytest

from supervisor.api import cloud_host as api_cloud_host
from supervisor.config import CoreConfig
from supervisor.coresys import CoreSys

from tests.cloud_host.fakes import SIGN_IN_URL, FakeRunner

HOSTNAME = "ha.example.com"


@pytest.fixture(name="runner")
def fixture_runner(tmp_path: Path, coresys: CoreSys):
    """Use a fake tunnel runner and a temporary state folder."""
    fake = FakeRunner()
    with (
        patch.object(api_cloud_host, "build_runner", return_value=fake),
        patch.object(
            CoreConfig, "path_supervisor", new=PropertyMock(return_value=tmp_path)
        ),
    ):
        yield fake


@pytest.mark.usefixtures("runner")
async def test_info_not_set_up(api_client_with_prefix: tuple[TestClient, str]) -> None:
    """Test info before anything is set up."""
    api_client, prefix = api_client_with_prefix

    resp = await api_client.get(f"{prefix}/cloud_host/info")

    assert resp.status == 200
    assert (await resp.json())["data"] == {
        "state": "not_set_up",
        "hostname": None,
        "error": None,
        "last_check": None,
    }


async def test_setup_and_lifecycle(
    api_client_with_prefix: tuple[TestClient, str], runner: FakeRunner
) -> None:
    """Test setup, sign-in, pause, resume, check and remove through the API."""
    api_client, prefix = api_client_with_prefix

    resp = await api_client.post(
        f"{prefix}/cloud_host/setup", json={"hostname": HOSTNAME}
    )
    data = (await resp.json())["data"]
    assert data["state"] == "waiting_for_sign_in"
    assert data["sign_in_url"] == SIGN_IN_URL

    resp = await api_client.get(f"{prefix}/cloud_host/sign_in")
    assert (await resp.json())["data"] == {"sign_in_url": SIGN_IN_URL}

    runner.signed_in = True
    resp = await api_client.get(f"{prefix}/cloud_host/info")
    data = (await resp.json())["data"]
    assert data["state"] == "running"
    assert "sign_in_url" not in data

    resp = await api_client.post(f"{prefix}/cloud_host/pause")
    assert (await resp.json())["data"]["state"] == "paused"

    resp = await api_client.post(f"{prefix}/cloud_host/resume")
    assert (await resp.json())["data"]["state"] == "running"

    resp = await api_client.post(f"{prefix}/cloud_host/remove")
    assert (await resp.json())["data"]["state"] == "not_set_up"


@pytest.mark.usefixtures("runner")
@pytest.mark.parametrize(
    "body",
    [{}, {"hostname": 5}, {"hostname": "203.0.113.5"}, {"hostname": "a/b.example.com"}],
)
async def test_setup_rejects_bad_hostname(
    api_client_with_prefix: tuple[TestClient, str], body: dict
) -> None:
    """Test setup refuses a missing or non-DNS hostname."""
    api_client, prefix = api_client_with_prefix

    resp = await api_client.post(f"{prefix}/cloud_host/setup", json=body)

    assert resp.status == 400


@pytest.mark.usefixtures("runner")
@pytest.mark.parametrize("action", ["pause", "resume", "check"])
async def test_actions_conflict_when_not_set_up(
    api_client_with_prefix: tuple[TestClient, str], action: str
) -> None:
    """Test actions that need a set up cloud host answer with a conflict."""
    api_client, prefix = api_client_with_prefix

    resp = await api_client.post(f"{prefix}/cloud_host/{action}")

    assert resp.status == 409


@pytest.mark.usefixtures("runner")
async def test_setup_with_runner_not_installed_style_error(
    api_client_with_prefix: tuple[TestClient, str], runner: FakeRunner
) -> None:
    """Test a runner failure is shown as the error state with its reason."""
    api_client, prefix = api_client_with_prefix
    runner.fail_on = {"begin_sign_in"}

    resp = await api_client.post(
        f"{prefix}/cloud_host/setup", json={"hostname": HOSTNAME}
    )

    data = (await resp.json())["data"]
    assert data["state"] == "error"
    assert data["error"] == "begin_sign_in failed"


async def test_check_makes_one_outside_request(
    api_client_with_prefix: tuple[TestClient, str],
    runner: FakeRunner,
    coresys: CoreSys,
) -> None:
    """Test the check records the status the hostname answered with."""
    api_client, prefix = api_client_with_prefix
    runner.signed_in = True

    with patch.object(
        api_cloud_host.APICloudHost,
        "_fetch_status",
        autospec=True,
        return_value=200,
    ) as fetch:
        await api_client.post(f"{prefix}/cloud_host/setup", json={"hostname": HOSTNAME})
        resp = await api_client.post(f"{prefix}/cloud_host/check")

    check = (await resp.json())["data"]["last_check"]
    assert check["ok"] is True
    assert check["status"] == 200
    assert fetch.call_args.args[1] == f"https://{HOSTNAME}/manifest.json"
