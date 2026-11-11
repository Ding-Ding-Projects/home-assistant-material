"""Tests for the passkey store."""

from typing import Any

import pytest

from homeassistant.components.passkey.const import (
    MAX_PENDING_REGISTRATIONS_PER_USER,
)
from homeassistant.components.passkey.origin import RelyingParty
from homeassistant.components.passkey.store import PasskeyStore
from homeassistant.core import HomeAssistant

RELYING_PARTY = RelyingParty(origin="https://ha.example.com", rp_id="ha.example.com")


def _stored(credential_id: str = "good") -> dict[str, Any]:
    return {
        "id": credential_id,
        "user_id": "user-1",
        "public_key": "key",
        "sign_count": 0,
        "transports": ["internal"],
        "name": "Laptop",
        "created": "2026-01-01T00:00:00+00:00",
        "rp_id": "ha.example.com",
        "last_used": None,
    }


@pytest.mark.parametrize(
    "bad",
    [
        pytest.param("junk", id="not_a_mapping"),
        pytest.param({"id": "only-an-id"}, id="missing_fields"),
        pytest.param({**_stored("extra"), "unexpected": 1}, id="unknown_field"),
        pytest.param({**_stored("number"), "sign_count": "five"}, id="wrong_type"),
        pytest.param({**_stored("transports"), "transports": "internal"}, id="list"),
        pytest.param({**_stored("ident"), "id": 7}, id="id_not_a_string"),
    ],
)
async def test_malformed_item_is_skipped_and_logged(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    caplog: pytest.LogCaptureFixture,
    bad: Any,
) -> None:
    """One bad stored item does not stop the others from loading."""
    hass_storage["passkey"] = {
        "version": 1,
        "key": "passkey",
        "data": {"credentials": [_stored("first"), bad, _stored("second")]},
    }
    store = PasskeyStore(hass)

    await store.async_load()

    assert store.get("first") is not None
    assert store.get("second") is not None
    assert len(store.for_user("user-1")) == 2
    assert "Skipping malformed stored passkey number 1" in caplog.text


@pytest.mark.parametrize(
    "data",
    [
        pytest.param({"credentials": "nope"}, id="credentials_not_a_list"),
        pytest.param({"other": []}, id="no_credentials_key"),
        pytest.param(["credentials"], id="not_a_mapping"),
    ],
)
async def test_unexpected_store_shape_is_logged_loudly(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    caplog: pytest.LogCaptureFixture,
    data: Any,
) -> None:
    """A store of the wrong shape loads nothing and says so."""
    hass_storage["passkey"] = {"version": 1, "key": "passkey", "data": data}
    store = PasskeyStore(hass)

    await store.async_load()

    assert store.for_user("user-1") == []
    assert "unexpected shape" in caplog.text


async def test_missing_store_is_not_an_error(
    hass: HomeAssistant, caplog: pytest.LogCaptureFixture
) -> None:
    """A first start has nothing stored and logs nothing."""
    store = PasskeyStore(hass)

    await store.async_load()

    assert "unexpected shape" not in caplog.text


def _add(store: PasskeyStore, user_id: str) -> str | None:
    return store.add_registration(
        challenge=b"c", relying_party=RELYING_PARTY, user_id=user_id, connection=object()
    )


async def test_a_user_replaces_their_own_oldest_registration(
    hass: HomeAssistant,
) -> None:
    """The per-user cap evicts that user's oldest entry and nobody else's."""
    store = PasskeyStore(hass)
    other = _add(store, "other")
    own = [_add(store, "me") for _ in range(MAX_PENDING_REGISTRATIONS_PER_USER + 2)]

    assert all(own)
    assert store.pop_registration(own[0] or "") is None
    assert store.pop_registration(own[1] or "") is None
    assert store.pop_registration(own[-1] or "") is not None
    assert store.pop_registration(other or "") is not None


async def test_a_full_pool_refuses_the_newcomer(
    hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When the pool is full nobody is evicted and the newcomer gets None."""
    monkeypatch.setattr(
        "homeassistant.components.passkey.store.MAX_PENDING_REGISTRATIONS", 2
    )
    store = PasskeyStore(hass)
    first = _add(store, "a")
    second = _add(store, "b")

    assert _add(store, "c") is None
    assert store.pop_registration(first or "") is not None
    assert store.pop_registration(second or "") is not None


async def test_registration_is_taken_once(hass: HomeAssistant) -> None:
    """A registration challenge is gone after it was taken."""
    store = PasskeyStore(hass)
    challenge_id = _add(store, "me")

    assert store.pop_registration(challenge_id or "") is not None
    assert store.pop_registration(challenge_id or "") is None
