"""Test installing offline update packs through the API."""

from typing import Any
from unittest.mock import AsyncMock, patch

from aiohttp.test_utils import TestClient
import pytest

from supervisor.const import CoreState
from supervisor.coresys import CoreSys
from supervisor.os.manager import OSManager

DRIVE_ID = "Generic-Flash-Disk-61BCDDB6"
PACK_PATH = "updates/ham-offline-pack-123/manifest.json"


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({}, id="empty"),
        pytest.param({"drive_id": DRIVE_ID}, id="no-path"),
        pytest.param({"path": PACK_PATH}, id="no-drive"),
        pytest.param({"drive_id": DRIVE_ID, "path": "a\x00b"}, id="control-character"),
        pytest.param(
            {"drive_id": DRIVE_ID, "path": PACK_PATH, "force": True}, id="extra-field"
        ),
    ],
)
async def test_api_os_offline_update_pack_invalid_body(
    api_client_with_prefix: tuple[TestClient, str], body: dict[str, Any]
) -> None:
    """Test the pack route accepts only a drive and a path."""
    api_client, prefix = api_client_with_prefix

    with patch.object(OSManager, "update_from_pack", AsyncMock()) as update:
        resp = await api_client.post(f"{prefix}/os/offline_update/pack", json=body)

    assert resp.status == 400
    update.assert_not_called()


async def test_api_os_offline_update_pack_without_os(
    api_client_with_prefix: tuple[TestClient, str], coresys: CoreSys
) -> None:
    """Test installing a pack requires Home Assistant OS."""
    api_client, prefix = api_client_with_prefix
    await coresys.core.set_state(CoreState.RUNNING)

    resp = await api_client.post(
        f"{prefix}/os/offline_update/pack",
        json={"drive_id": DRIVE_ID, "path": PACK_PATH},
    )

    assert resp.status == 400
    assert "no Home Assistant OS available" in (await resp.json())["message"]
