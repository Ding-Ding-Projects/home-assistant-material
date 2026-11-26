"""Test the onboarding views for a restore queued during first start."""

from http import HTTPStatus
from typing import Any
from unittest.mock import AsyncMock, Mock, patch

import pytest
from pytest_homeassistant.typing import ClientSessionGenerator

from homeassistant.components.hassio.const import DATA_COMPONENT
from homeassistant.components.hassio.handler import HassioAPIError
from homeassistant.components.onboarding import DOMAIN, views
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from . import mock_storage

URL = "/api/onboarding/restore/pending"
RECORD = {
    "slug": "7fed74c8",
    "name": "Full backup",
    "size_bytes": 1024,
    "protected": True,
    "state": "failed",
    "first_start": True,
    "queued_at": "2026-11-25T10:00:00+00:00",
    "started_at": "2026-11-25T10:01:00+00:00",
    "finished_at": "2026-11-25T10:02:00+00:00",
    "job_id": "0123456789abcdef0123456789abcdef",
    "error": "No space left",
}


@pytest.fixture(autouse=True)
def no_interval() -> Any:
    """Do not space out changes unless a test asks for it."""
    with patch.object(views, "PENDING_RESTORE_MIN_INTERVAL", 0.0):
        yield


@pytest.fixture
def supervisor(hass: HomeAssistant) -> Mock:
    """Put a fake Supervisor connection in place."""
    client = Mock()
    client.send_command = AsyncMock(return_value={"data": {"pending_restore": RECORD}})
    hass.data[DATA_COMPONENT] = client
    return client


async def _setup(hass: HomeAssistant, hass_storage: dict[str, Any], done: list[str]):
    mock_storage(hass_storage, {"done": done})
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()


async def test_get_passes_on_only_what_the_page_needs(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_client_no_auth: ClientSessionGenerator,
    supervisor: Mock,
) -> None:
    """The slug, job id and key flag of the record stay with the Supervisor."""
    await _setup(hass, hass_storage, [])
    client = await hass_client_no_auth()

    resp = await client.get(URL)

    assert resp.status == HTTPStatus.OK
    body = (await resp.json())["pending_restore"]
    assert body["state"] == "failed"
    assert body["name"] == "Full backup"
    assert body["error"] == "No space left"
    assert set(body) == set(views.PENDING_RESTORE_FIELDS)
    assert "slug" not in body
    assert "job_id" not in body


async def test_get_without_a_record(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_client_no_auth: ClientSessionGenerator,
    supervisor: Mock,
) -> None:
    """No queued restore reads as null."""
    supervisor.send_command.return_value = {"data": {"pending_restore": None}}
    await _setup(hass, hass_storage, [])
    client = await hass_client_no_auth()

    resp = await client.get(URL)

    assert await resp.json() == {"pending_restore": None}


async def test_supervisor_error_is_a_bad_gateway(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_client_no_auth: ClientSessionGenerator,
    supervisor: Mock,
) -> None:
    """The page treats an unreachable Supervisor as not known yet."""
    supervisor.send_command.side_effect = HassioAPIError("down")
    await _setup(hass, hass_storage, [])
    client = await hass_client_no_auth()

    resp = await client.get(URL)

    assert resp.status == HTTPStatus.BAD_GATEWAY


async def test_no_supervisor_is_not_found(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_client_no_auth: ClientSessionGenerator,
) -> None:
    """Without a Supervisor there is nothing to report."""
    await _setup(hass, hass_storage, [])
    client = await hass_client_no_auth()

    resp = await client.get(URL)

    assert resp.status == HTTPStatus.NOT_FOUND


@pytest.mark.parametrize(
    ("method", "url", "kwargs"),
    [
        ("get", URL, {}),
        ("delete", URL, {"json": {"remove_backup": True}}),
        ("post", f"{URL}/retry", {"json": {}}),
    ],
)
async def test_not_served_once_onboarding_is_done(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_client_no_auth: ClientSessionGenerator,
    supervisor: Mock,
    method: str,
    url: str,
    kwargs: dict[str, Any],
) -> None:
    """After onboarding the routes are not registered, and the Supervisor is not asked."""
    await _setup(hass, hass_storage, ["user", "core_config", "integration"])
    client = await hass_client_no_auth()

    resp = await getattr(client, method)(url, **kwargs)

    assert resp.status == HTTPStatus.NOT_FOUND
    supervisor.send_command.assert_not_called()


async def test_discard_removes_the_backup_when_asked(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_client_no_auth: ClientSessionGenerator,
    supervisor: Mock,
) -> None:
    """Set up without the backup discards the record and the uploaded file."""
    await _setup(hass, hass_storage, [])
    client = await hass_client_no_auth()

    resp = await client.delete(URL, json={"remove_backup": True})

    assert resp.status == HTTPStatus.OK
    supervisor.send_command.assert_awaited_once_with(
        "/backups/restore/pending",
        method="delete",
        payload={"remove_backup": True},
        source="core.onboarding",
    )


async def test_discard_refused_by_the_supervisor(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_client_no_auth: ClientSessionGenerator,
    supervisor: Mock,
) -> None:
    """A restore that is running cannot be discarded."""
    supervisor.send_command.side_effect = HassioAPIError("running")
    await _setup(hass, hass_storage, [])
    client = await hass_client_no_auth()

    resp = await client.delete(URL, json={})

    assert resp.status == HTTPStatus.CONFLICT


async def test_retry_passes_the_key_on(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_client_no_auth: ClientSessionGenerator,
    supervisor: Mock,
) -> None:
    """Try again sends the key to the Supervisor and never reads it back."""
    await _setup(hass, hass_storage, [])
    client = await hass_client_no_auth()

    resp = await client.post(f"{URL}/retry", json={"password": "pw"})

    assert resp.status == HTTPStatus.OK
    assert "pw" not in await resp.text()
    supervisor.send_command.assert_awaited_once_with(
        "/backups/restore/pending/retry",
        payload={"password": "pw"},
        timeout=60,
        source="core.onboarding",
    )


async def test_changes_are_spaced_out(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_client_no_auth: ClientSessionGenerator,
    supervisor: Mock,
) -> None:
    """A second attempt right after the first is refused."""
    await _setup(hass, hass_storage, [])
    client = await hass_client_no_auth()

    with patch.object(views, "PENDING_RESTORE_MIN_INTERVAL", 60.0):
        first = await client.post(f"{URL}/retry", json={"password": "a"})
        second = await client.post(f"{URL}/retry", json={"password": "b"})

    assert first.status == HTTPStatus.OK
    assert second.status == HTTPStatus.TOO_MANY_REQUESTS
    assert supervisor.send_command.await_count == 1


@pytest.mark.parametrize(
    ("method", "url", "kwargs"),
    [
        ("get", URL, {}),
        ("delete", URL, {"json": {"remove_backup": True}}),
        ("post", f"{URL}/retry", {"json": {}}),
    ],
)
async def test_refused_while_onboarding_is_unfinished_but_the_user_exists(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_client_no_auth: ClientSessionGenerator,
    supervisor: Mock,
    method: str,
    url: str,
    kwargs: dict[str, Any],
) -> None:
    """Views are registered, but the in-handler guard still answers 401."""
    await _setup(hass, hass_storage, [])
    client = await hass_client_no_auth()
    # Onboarding finishes after the views were registered
    hass.data[DOMAIN].steps["done"] = ["user", "core_config", "integration"]

    resp = await getattr(client, method)(url, **kwargs)

    assert resp.status == HTTPStatus.UNAUTHORIZED
    supervisor.send_command.assert_not_called()


async def test_get_refused_when_onboarding_finishes_during_the_call(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_client_no_auth: ClientSessionGenerator,
    supervisor: Mock,
) -> None:
    """A record fetched just as onboarding completes is not handed out."""
    await _setup(hass, hass_storage, [])
    client = await hass_client_no_auth()

    async def finish(*args: Any, **kwargs: Any) -> dict[str, Any]:
        hass.data[DOMAIN].steps["done"] = ["user", "core_config", "integration"]
        return {"data": {"pending_restore": RECORD}}

    supervisor.send_command.side_effect = finish

    resp = await client.get(URL)

    assert resp.status == HTTPStatus.UNAUTHORIZED
    assert "Full backup" not in await resp.text()
