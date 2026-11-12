"""Test the evaluations skipped when the Supervisor runs in the full hosting mode."""

# pylint: disable=import-error,protected-access
from unittest.mock import MagicMock, patch

import pytest

from supervisor.const import CoreState
from supervisor.coresys import CoreSys
from supervisor.resolution.const import (
    CONTAINER_HOST_EXPECTED_REASONS,
    ENV_CONTAINER_HOST,
    UnsupportedReason,
)
from supervisor.resolution.evaluations.apparmor import EvaluateAppArmor
from supervisor.resolution.evaluations.docker_version import EvaluateDockerVersion
from supervisor.resolution.evaluations.os_agent import EvaluateOSAgent


async def test_expected_reasons_are_skipped_with_switch(
    coresys: CoreSys, monkeypatch: pytest.MonkeyPatch
):
    """An expected reason is neither evaluated nor reported when the switch is on."""
    monkeypatch.setenv(ENV_CONTAINER_HOST, "1")
    apparmor = EvaluateAppArmor(coresys)
    await coresys.core.set_state(CoreState.INITIALIZE)

    with patch("pathlib.Path.read_text", return_value="N") as read_text:
        await apparmor()

    read_text.assert_not_called()
    assert apparmor.reason not in coresys.resolution.unsupported


async def test_expected_reasons_are_reported_without_switch(
    coresys: CoreSys, monkeypatch: pytest.MonkeyPatch
):
    """An expected reason is still reported when the switch is off."""
    monkeypatch.delenv(ENV_CONTAINER_HOST, raising=False)
    apparmor = EvaluateAppArmor(coresys)
    await coresys.core.set_state(CoreState.INITIALIZE)

    with patch("pathlib.Path.read_text", return_value="N"):
        await apparmor()

    assert apparmor.reason in coresys.resolution.unsupported


async def test_switch_value_must_be_one(
    coresys: CoreSys, monkeypatch: pytest.MonkeyPatch
):
    """Only the exact value 1 turns the switch on."""
    monkeypatch.setenv(ENV_CONTAINER_HOST, "0")
    agent = EvaluateOSAgent(coresys)
    await coresys.core.set_state(CoreState.SETUP)
    coresys._host = MagicMock(info=MagicMock(timezone=None, timezone_tzinfo=None))
    coresys.host.features = []

    await agent()

    assert agent.reason in coresys.resolution.unsupported


async def test_other_evaluations_still_run_with_switch(
    coresys: CoreSys, monkeypatch: pytest.MonkeyPatch
):
    """A reason that is not expected in the mode is still evaluated and reported."""
    monkeypatch.setenv(ENV_CONTAINER_HOST, "1")
    docker_version = EvaluateDockerVersion(coresys)
    await coresys.core.set_state(CoreState.INITIALIZE)
    assert docker_version.reason not in CONTAINER_HOST_EXPECTED_REASONS

    with patch.object(EvaluateDockerVersion, "evaluate", return_value=True):
        await docker_version()

    assert docker_version.reason in coresys.resolution.unsupported


def test_expected_reasons_list():
    """Only reasons that describe a missing operating system are expected."""
    assert CONTAINER_HOST_EXPECTED_REASONS == {
        UnsupportedReason.APPARMOR,
        UnsupportedReason.DBUS,
        UnsupportedReason.DOCKER_CONFIGURATION,
        UnsupportedReason.NETWORK_MANAGER,
        UnsupportedReason.OS,
        UnsupportedReason.OS_AGENT,
        UnsupportedReason.SYSTEMD,
        UnsupportedReason.SYSTEMD_JOURNAL,
        UnsupportedReason.SYSTEMD_RESOLVED,
    }
