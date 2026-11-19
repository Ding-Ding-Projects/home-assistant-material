"""Tests for delete proof backups."""

from dataclasses import replace
from datetime import timedelta
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, Mock

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import async_fire_time_changed
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.auth.models import User
from homeassistant.components.backup import AgentBackup, BackupDeleteProof
from homeassistant.components.backup.config import (
    delete_backups_exceeding_configured_count,
)
from homeassistant.components.backup.const import DATA_MANAGER
from homeassistant.components.backup.delete_proof import (
    DeleteProofMark,
    DeleteProofMarks,
)
from homeassistant.core import HomeAssistant

from .common import TEST_BACKUP_ABC123, setup_backup_integration

REMOTE_AGENT_ID = "test.remote"


def _automatic(backup_id: str, year: int) -> AgentBackup:
    """Return an automatic backup made by this instance in a given year."""
    return replace(
        TEST_BACKUP_ABC123,
        backup_id=backup_id,
        date=f"{year}-01-01T00:00:00.000Z",
        name=f"Automatic {year}",
    )


BACKUPS = [
    _automatic("oldest", 2000),
    _automatic("second", 2001),
    _automatic("third", 2002),
    _automatic("newest", 2003),
]


async def _setup(hass: HomeAssistant) -> Mock:
    """Set up the integration with one remote agent holding four backups."""
    agents = await setup_backup_integration(
        hass,
        with_hassio=False,
        backups={REMOTE_AGENT_ID: list(BACKUPS)},
        remote_agents=[REMOTE_AGENT_ID],
    )
    return agents[REMOTE_AGENT_ID]


def _deleted(agent: Mock) -> set[str]:
    """Return the backup IDs the agent was asked to delete."""
    return {call.args[0] for call in agent.async_delete_backup.call_args_list}


async def test_delete_refused_while_marked(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A delete proof backup is refused with a reason; others are deleted."""
    agent = await _setup(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": "backup/delete_proof/set", "backup_id": "oldest", "delete_proof": True}
    )
    result = await client.receive_json()
    assert result["success"]
    assert result["result"]["delete_proof"]["marked_by"]

    await client.send_json_auto_id({"type": "backup/delete", "backup_id": "oldest"})
    result = await client.receive_json()
    assert not result["success"]
    assert result["error"]["code"] == "backup_delete_proof"
    assert "oldest" not in _deleted(agent)

    await client.send_json_auto_id({"type": "backup/delete", "backup_id": "second"})
    result = await client.receive_json()
    assert result["success"]
    assert "second" in _deleted(agent)

    with pytest.raises(BackupDeleteProof):
        await hass.data[DATA_MANAGER].async_delete_backup("oldest")


async def test_turn_off_needs_confirmation(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Turning delete proof off without the confirmation is refused."""
    agent = await _setup(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "backup/delete_proof/set", "backup_id": "oldest", "delete_proof": True}
    )
    assert (await client.receive_json())["success"]

    await client.send_json_auto_id(
        {
            "type": "backup/delete_proof/set",
            "backup_id": "oldest",
            "delete_proof": False,
        }
    )
    result = await client.receive_json()
    assert not result["success"]
    assert result["error"]["code"] == "confirmation_required"
    assert hass.data[DATA_MANAGER].delete_proof.is_marked("oldest")

    await client.send_json_auto_id(
        {
            "type": "backup/delete_proof/set",
            "backup_id": "oldest",
            "delete_proof": False,
            "confirmed": True,
        }
    )
    assert (await client.receive_json())["success"]

    await client.send_json_auto_id({"type": "backup/delete", "backup_id": "oldest"})
    assert (await client.receive_json())["success"]
    assert "oldest" in _deleted(agent)


async def test_mark_unknown_backup(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A backup that no location holds cannot be marked."""
    await _setup(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "backup/delete_proof/set", "backup_id": "nope", "delete_proof": True}
    )
    result = await client.receive_json()
    assert result["error"]["code"] == "not_found"


@pytest.mark.parametrize(
    "message",
    [
        {
            "type": "backup/delete_proof/set",
            "backup_id": "oldest",
            "delete_proof": True,
        },
        {"type": "backup/delete_proof/info"},
    ],
)
async def test_non_admin_refused(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: User,
    message: dict[str, Any],
) -> None:
    """Only an administrator can see or change delete proof."""
    await _setup(hass)
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(message)
    result = await client.receive_json()
    assert result["error"]["code"] == "unauthorized"
    assert not hass.data[DATA_MANAGER].delete_proof.is_marked("oldest")


async def test_info_reports_marks(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Backup info carries the mark; the mark list includes missing backups."""
    await _setup(hass)
    manager = hass.data[DATA_MANAGER]
    await manager.delete_proof.async_set(
        "oldest", marked_by="user-id", marked_by_name="Owner"
    )
    await manager.delete_proof.async_set(
        "gone", marked_by="user-id", marked_by_name="Owner"
    )
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "backup/info"})
    backups = {
        b["backup_id"]: b for b in (await client.receive_json())["result"]["backups"]
    }
    assert backups["oldest"]["delete_proof"]["marked_by_name"] == "Owner"
    assert "delete_proof" not in backups["second"]

    await client.send_json_auto_id({"type": "backup/delete_proof/info"})
    result = (await client.receive_json())["result"]
    assert result["readable"] is True
    assert set(result["marks"]) == {"oldest", "gone"}


async def test_retention_by_count_keeps_marked_besides(hass: HomeAssistant) -> None:
    """A marked backup is kept and does not count toward the copies to keep."""
    agent = await _setup(hass)
    manager = hass.data[DATA_MANAGER]
    await manager.delete_proof.async_set("oldest", marked_by="u", marked_by_name=None)
    manager.config.update(retention={"copies": 2, "days": None})

    await delete_backups_exceeding_configured_count(manager)

    assert _deleted(agent) == {"second"}


async def test_retention_by_age_keeps_marked(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Automatic deletion by age never removes a marked backup."""
    agent = await _setup(hass)
    manager = hass.data[DATA_MANAGER]
    await manager.delete_proof.async_set("oldest", marked_by="u", marked_by_name=None)
    manager.config.update(retention={"copies": None, "days": 1})

    freezer.tick(timedelta(days=1, seconds=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done(wait_background_tasks=True)

    # The newest is kept because the last backup of a location is never deleted
    assert _deleted(agent) == {"second", "third"}


async def test_mark_survives_reload(hass: HomeAssistant) -> None:
    """The mark is read back from the file kept in the backups folder."""
    await _setup(hass)
    manager = hass.data[DATA_MANAGER]
    mark = await manager.delete_proof.async_set(
        "oldest", marked_by="u", marked_by_name="Owner"
    )
    assert manager.delete_proof.path.parent.name == "backups"
    assert manager.delete_proof.path.exists()

    reloaded = DeleteProofMarks(hass)
    await reloaded.async_load(
        Mock(async_load_delete_proof=AsyncMock(return_value=None))
    )
    assert reloaded.readable
    assert reloaded.get("oldest") == mark


async def test_marks_held_elsewhere_win(hass: HomeAssistant) -> None:
    """When the Supervisor holds the marks they replace the local copy."""
    await _setup(hass)
    held = {
        "second": DeleteProofMark(
            marked_at="2026-11-18T21:58:00+00:00", marked_by="u", marked_by_name=None
        )
    }
    reader_writer = Mock(
        async_load_delete_proof=AsyncMock(return_value=held),
        async_save_delete_proof=AsyncMock(),
    )
    marks = DeleteProofMarks(hass)
    await marks.async_load(reader_writer)
    assert marks.all() == held

    await marks.async_set("third", marked_by="u", marked_by_name=None)
    reader_writer.async_save_delete_proof.assert_awaited_once()
    assert reader_writer.async_save_delete_proof.await_args.args[0] == "third"


async def test_unreadable_marks_refuse_every_delete(
    hass: HomeAssistant, hass_config_dir: str
) -> None:
    """If the marks cannot be read, nothing is deleted by hand or by retention."""
    path = Path(hass_config_dir, "backups", "delete_proof.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("not json")
    agent = await _setup(hass)
    manager = hass.data[DATA_MANAGER]
    assert manager.delete_proof.readable is False

    with pytest.raises(Exception, match="cannot be read"):
        await manager.async_delete_backup("second")
    manager.config.update(retention={"copies": 1, "days": None})
    await delete_backups_exceeding_configured_count(manager)
    assert _deleted(agent) == set()
    assert path.read_text() == "not json"
