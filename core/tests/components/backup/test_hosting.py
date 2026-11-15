"""Backup hosting request ownership and replay protection."""

from unittest.mock import AsyncMock, Mock, patch
from pathlib import Path
import tarfile

import pytest
from securetar import SecureTarFile

from homeassistant.components.backup.const import DATA_MANAGER
from homeassistant.components.backup.hosting import HostingManager
from homeassistant.components.backup.hosting import websocket as hosting_websocket
from homeassistant.components.backup.hosting.client import HostingError
from homeassistant.components.backup.manager import CoreBackupReaderWriter
from homeassistant.components.websocket_api.const import WebSocketCommandHandler
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized


async def test_pairing_details_required(hass: HomeAssistant) -> None:
    """An incomplete pair never causes a network request."""
    manager = HostingManager(hass)
    with pytest.raises(HostingError, match="pairing_details_required"):
        await manager.async_pair({})


@pytest.mark.parametrize("handler", [hosting_websocket.status, hosting_websocket.pair, hosting_websocket.start, hosting_websocket.jobs, hosting_websocket.cancel])
async def test_all_hosting_commands_require_administrator(hass: HomeAssistant, handler: WebSocketCommandHandler) -> None:
    """Ordinary authenticated users cannot pair, transfer or cancel host jobs."""
    connection = Mock(user=Mock(is_admin=False))
    with pytest.raises(Unauthorized):
        handler(hass, connection, {"id": 1})


async def test_incorrect_password_retry_uses_same_upload(hass: HomeAssistant) -> None:
    """An explicit corrected key never provisions a second instance."""
    manager = HostingManager(hass)
    identity = {"bridge_id": "bridge-1", "backup_id": "first", "agent_id": "local", "target": "docker"}
    manager.data["requests"]["request-1"] = {"identity": identity, "state": "submitted", "upload_handle": "existing-upload"}
    client = Mock(request=AsyncMock(return_value={"id": "native-1", "request_id": "request-1", "state": "restoring"}))
    with (
        patch.object(manager, "async_jobs", return_value={"jobs": [{"id": "native-1", "request_id": "request-1", "error_code": "incorrect_password"}]}),
        patch.object(manager, "client", return_value=client),
    ):
        result = await manager.async_start({"request_id": "request-1", **identity, "password": "corrected-key"})
    assert result["id"] == "native-1"
    client.request.assert_awaited_once_with("POST", "/v1/jobs", body={"request_id": "request-1", "upload_handle": "existing-upload", "target": "docker", "options": {"automation_state": "original"}, "password": "corrected-key"})
    assert "password" not in manager.data["requests"]["request-1"]


async def test_pairing_poll_expired(hass: HomeAssistant) -> None:
    """Pairing challenges are transient and cannot be recovered after restart."""
    manager = HostingManager(hass)
    with pytest.raises(HostingError, match="pairing_expired"):
        await manager.async_pair({"bridge_id": "missing"})


async def test_pairing_credential_not_returned(hass: HomeAssistant) -> None:
    """Only native approval can install a credential; no response exposes it."""
    manager = HostingManager(hass)
    manager.core_id = "core-1"
    with (
        patch("homeassistant.components.backup.hosting.BridgeClient.request", new_callable=AsyncMock) as request,
        patch.object(manager.store, "async_save", new_callable=AsyncMock),
    ):
        request.return_value = {"pairing_id": "pair-1", "state": "pending_native_approval"}
        result = await manager.async_pair({"url": "https://localhost:4198", "fingerprint": "ab" * 32})
        bridge_id = result["bridge_id"]
        client_id = manager.pending[bridge_id]["client_id"]
        request.return_value = {"state": "paired", "client_id": client_id, "credential": "private-credential"}
        assert await manager.async_pair({"bridge_id": bridge_id}) == {"bridge_id": bridge_id, "state": "paired"}
    assert manager.data["bridges"][bridge_id]["credential"] == "private-credential"
    assert manager.pending == {}
    assert "challenge" not in manager.data["bridges"][bridge_id]


async def test_request_identity_conflict(hass: HomeAssistant) -> None:
    """Reusing an id cannot select a different archive or hosting target."""
    manager = HostingManager(hass)
    manager.data["requests"]["request-1"] = {"identity": {"bridge_id": "bridge-1", "backup_id": "first", "agent_id": "local", "target": "docker"}, "state": "submitted"}
    with pytest.raises(HostingError, match="request_id_conflict"):
        await manager.async_start({"request_id": "request-1", "bridge_id": "bridge-1", "backup_id": "second", "agent_id": "local", "target": "docker"})


async def test_uncertain_submission_reconciles_without_replay(hass: HomeAssistant) -> None:
    """Reconnecting lists jobs instead of provisioning a duplicate instance."""
    manager = HostingManager(hass)
    identity = {"bridge_id": "bridge-1", "backup_id": "first", "agent_id": "local", "target": "docker"}
    manager.data["requests"]["request-1"] = {"identity": identity, "state": "reconciliation_needed"}
    with patch.object(manager, "async_jobs", return_value={"jobs": [{"id": "native-1", "request_id": "request-1", "state": "ready"}]}) as jobs:
        assert await manager.async_start({"request_id": "request-1", **identity}) == {"id": "native-1", "request_id": "request-1", "state": "ready"}
    jobs.assert_awaited_once_with("bridge-1")


async def test_protected_backup_requires_key_before_transfer(hass: HomeAssistant) -> None:
    """A missing decryption key cannot create a job or download an archive."""
    manager = HostingManager(hass)
    agent = Mock(async_get_backup=AsyncMock(return_value=Mock(protected=True)), async_download_backup=AsyncMock())
    hass.data[DATA_MANAGER] = Mock(backup_agents={"local": agent})
    client = Mock(request=AsyncMock(return_value={"capabilities": {"targets": ["docker"], "target_status": {"docker": {"available": True}}}}))
    with patch.object(manager, "client", return_value=client), pytest.raises(HostingError, match="key_needed"):
        await manager.async_start({"request_id": "request-1", "bridge_id": "bridge-1", "backup_id": "first", "agent_id": "local", "target": "docker"})
    agent.async_download_backup.assert_not_awaited()
    assert manager.data["requests"] == {}


async def test_core_archive_excludes_only_host_authority(hass: HomeAssistant, tmp_path: Path) -> None:
    """Actual configuration archives retain ordinary identity and automation data."""
    config_dir = tmp_path / "config"
    storage_dir = config_dir / ".storage"
    await hass.async_add_executor_job(storage_dir.mkdir, 0o700, True)
    for name in ("backup.hosting", "core.uuid", "auth"):
        await hass.async_add_executor_job((storage_dir / name).write_text, "test data")
    await hass.async_add_executor_job((config_dir / "automations.yaml").write_text, "original active automations")
    hass.config.config_dir = str(config_dir)
    writer = CoreBackupReaderWriter(hass)
    output = tmp_path / "backup.tar"
    await hass.async_add_executor_job(writer._mkdir_and_generate_backup_contents, {"slug": "test"}, True, None, output)

    def read_members() -> set[str]:
        with tarfile.TarFile(output, mode="r") as outer:
            with SecureTarFile(fileobj=outer.extractfile("homeassistant.tar.gz"), gzip=True) as inner:
                return set(inner.getnames())

    members = await hass.async_add_executor_job(read_members)
    assert "data/.storage/backup.hosting" not in members
    assert "data/.storage/core.uuid" in members
    assert "data/.storage/auth" in members
    assert "data/automations.yaml" in members
