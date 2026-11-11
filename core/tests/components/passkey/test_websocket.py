"""Tests for the passkey WebSocket commands."""

from collections.abc import Generator
from datetime import timedelta
from typing import Any
from unittest.mock import patch

from aiohttp.test_utils import make_mocked_request
from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import MockUser
from pytest_homeassistant.typing import MockHAClientWebSocket, WebSocketGenerator

from homeassistant.auth.models import TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN, Credentials
from homeassistant.components.passkey.const import (
    MAX_PENDING_REGISTRATIONS_PER_USER,
    REGISTRATION_FRESH_WINDOW,
)
from homeassistant.components.passkey.origin import RelyingParty
from homeassistant.components.passkey.store import DATA_STORE
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .authenticator import SoftwareAuthenticator, b64url
from .conftest import ORIGIN, RP_ID, Account, create_account


@pytest.fixture
def secure_origin() -> Generator[None]:
    """Pretend the browser reached Home Assistant on http://localhost."""
    with patch(
        "homeassistant.components.passkey.websocket.async_resolve_relying_party",
        return_value=RelyingParty(origin=ORIGIN, rp_id=RP_ID),
    ):
        yield


async def _call(
    ws: MockHAClientWebSocket, msg_type: str, **fields: Any
) -> dict[str, Any]:
    await ws.send_json_auto_id({"type": msg_type, **fields})
    return await ws.receive_json()


async def _begin(ws: MockHAClientWebSocket) -> dict[str, Any]:
    resp = await _call(ws, "passkey/register_begin")
    assert resp["success"]
    return resp["result"]


async def _register(
    ws: MockHAClientWebSocket,
    authenticator: SoftwareAuthenticator,
    **overrides: Any,
) -> dict[str, Any]:
    begin = await _begin(ws)
    return await _call(
        ws,
        "passkey/register_finish",
        challenge_id=begin["challenge_id"],
        credential=authenticator.create(begin["options"], **overrides),
        name="Phone",
    )


def _new_authenticator() -> SoftwareAuthenticator:
    return SoftwareAuthenticator(origin=ORIGIN, rp_id=RP_ID)


@pytest.mark.usefixtures("secure_origin")
async def test_register_list_rename_delete(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MockUser,
) -> None:
    """A signed-in user can add, list, rename and remove their passkeys."""
    ws = await hass_ws_client(hass)
    begin = await _begin(ws)
    options = begin["options"]
    assert options["rp"]["id"] == RP_ID
    assert options["authenticatorSelection"]["residentKey"] == "required"
    assert options["authenticatorSelection"]["userVerification"] == "required"
    assert options["attestation"] == "none"

    authenticator = _new_authenticator()
    resp = await _call(
        ws,
        "passkey/register_finish",
        challenge_id=begin["challenge_id"],
        credential=authenticator.create(options),
        name="  Phone   one ",
    )
    assert resp["success"]
    created = resp["result"]
    assert created["name"] == "Phone one"
    assert created["id"] == authenticator.credential_id_b64
    assert "public_key" not in created
    assert "sign_count" not in created

    stored = hass.data[DATA_STORE].get(created["id"])
    assert stored is not None
    assert stored.user_id == hass_admin_user.id
    assert stored.transports == ["internal"]
    assert stored.rp_id == RP_ID

    listed = await _call(ws, "passkey/list")
    assert [item["id"] for item in listed["result"]] == [created["id"]]

    renamed = await _call(
        ws, "passkey/rename", credential_id=created["id"], name="Tablet"
    )
    assert renamed["result"]["name"] == "Tablet"

    deleted = await _call(ws, "passkey/delete", credential_id=created["id"])
    assert deleted["success"]
    assert (await _call(ws, "passkey/list"))["result"] == []
    assert hass.data[DATA_STORE].get(created["id"]) is None


@pytest.mark.usefixtures("secure_origin")
@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"challenge": b64url(b"x" * 32)}, id="wrong_challenge"),
        pytest.param({"origin": "https://evil.example"}, id="wrong_origin"),
        pytest.param({"rp_id": "example.com"}, id="wrong_rp_id"),
        pytest.param({"user_verified": False}, id="user_verification_missing"),
    ],
)
async def test_register_refused(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    overrides: dict[str, Any],
) -> None:
    """A bad attestation is refused and nothing is stored."""
    ws = await hass_ws_client(hass)

    resp = await _register(ws, _new_authenticator(), **overrides)

    assert not resp["success"]
    assert (await _call(ws, "passkey/list"))["result"] == []


@pytest.mark.usefixtures("secure_origin")
async def test_register_challenge_is_single_use(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The same challenge cannot register twice."""
    ws = await hass_ws_client(hass)
    begin = await _begin(ws)
    credential = _new_authenticator().create(begin["options"])

    first = await _call(
        ws,
        "passkey/register_finish",
        challenge_id=begin["challenge_id"],
        credential=credential,
    )
    second = await _call(
        ws,
        "passkey/register_finish",
        challenge_id=begin["challenge_id"],
        credential=credential,
    )

    assert first["success"]
    assert not second["success"]
    assert len((await _call(ws, "passkey/list"))["result"]) == 1


@pytest.mark.usefixtures("secure_origin")
async def test_register_challenge_expires(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    freezer: FrozenDateTimeFactory,
) -> None:
    """An old registration challenge is refused."""
    ws = await hass_ws_client(hass)
    begin = await _begin(ws)
    credential = _new_authenticator().create(begin["options"])

    freezer.tick(timedelta(minutes=6))

    resp = await _call(
        ws,
        "passkey/register_finish",
        challenge_id=begin["challenge_id"],
        credential=credential,
    )
    assert not resp["success"]


@pytest.mark.usefixtures("secure_origin")
async def test_register_challenge_is_bound_to_the_connection(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A challenge started on one connection cannot be finished on another."""
    first = await hass_ws_client(hass)
    second = await hass_ws_client(hass)
    begin = await _begin(first)

    resp = await _call(
        second,
        "passkey/register_finish",
        challenge_id=begin["challenge_id"],
        credential=_new_authenticator().create(begin["options"]),
    )

    assert not resp["success"]


async def test_register_needs_a_secure_origin(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """On an address WebAuthn cannot use, registration is not supported."""
    ws = await hass_ws_client(hass)

    resp = await _call(ws, "passkey/register_begin")

    assert not resp["success"]
    assert resp["error"]["code"] == "not_supported"


@pytest.mark.usefixtures("secure_origin")
async def test_credential_cannot_be_registered_twice(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    account: Account,
) -> None:
    """A credential id that is already stored is refused."""
    ws = await hass_ws_client(hass)

    resp = await _register(ws, account.authenticator)

    assert not resp["success"]


@pytest.mark.usefixtures("secure_origin")
async def test_existing_passkeys_are_excluded_on_begin(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The authenticator is told which credentials the user already has."""
    ws = await hass_ws_client(hass)
    authenticator = _new_authenticator()
    assert (await _register(ws, authenticator))["success"]

    begin = await _begin(ws)

    assert [item["id"] for item in begin["options"]["excludeCredentials"]] == [
        authenticator.credential_id_b64
    ]


async def test_user_cannot_touch_another_users_passkey(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
    account: Account,
) -> None:
    """A user who is not an administrator only reaches their own passkeys."""
    ws = await hass_ws_client(hass, hass_read_only_access_token)
    credential_id = account.authenticator.credential_id_b64

    listed = await _call(ws, "passkey/list", user_id=account.user.id)
    renamed = await _call(ws, "passkey/rename", credential_id=credential_id, name="x")
    deleted = await _call(ws, "passkey/delete", credential_id=credential_id)

    assert listed["error"]["code"] == "unauthorized"
    assert renamed["error"]["code"] == "not_found"
    assert deleted["error"]["code"] == "not_found"
    assert hass.data[DATA_STORE].get(credential_id) is not None


async def test_administrator_manages_any_users_passkeys(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MockUser,
    account: Account,
) -> None:
    """An administrator can list, rename and delete another user's passkeys."""
    ws = await hass_ws_client(hass)
    credential_id = account.authenticator.credential_id_b64

    listed = await _call(ws, "passkey/list", user_id=account.user.id)
    renamed = await _call(
        ws,
        "passkey/rename",
        credential_id=credential_id,
        name="Renamed",
        user_id=account.user.id,
    )
    deleted = await _call(
        ws, "passkey/delete", credential_id=credential_id, user_id=account.user.id
    )

    assert [item["id"] for item in listed["result"]] == [credential_id]
    assert renamed["result"]["name"] == "Renamed"
    assert deleted["success"]
    assert hass.data[DATA_STORE].get(credential_id) is None


async def test_passkey_of_the_wrong_user_id_is_not_found(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MockUser,
    account: Account,
) -> None:
    """Naming a passkey together with another user's id finds nothing."""
    other = await create_account(hass, "Other User")
    ws = await hass_ws_client(hass)

    resp = await _call(
        ws,
        "passkey/delete",
        credential_id=account.authenticator.credential_id_b64,
        user_id=other.user.id,
    )

    assert resp["error"]["code"] == "not_found"


async def test_removing_a_user_removes_their_passkeys(
    hass: HomeAssistant, account: Account
) -> None:
    """Passkeys do not outlive their user."""
    await hass.auth.async_remove_user(account.user)
    await hass.async_block_till_done()

    assert hass.data[DATA_STORE].for_user(account.user.id) == []


def _request_for(host: str, scheme: str = "https") -> Any:
    return make_mocked_request("GET", "/").clone(scheme=scheme, host=host)


@pytest.fixture
def https_request() -> Generator[None]:
    """Make the websocket commands see a request to https://ha.example.com."""
    with patch(
        "homeassistant.components.passkey.websocket.current_request"
    ) as request_context:
        request_context.get.return_value = _request_for("ha.example.com")
        yield


@pytest.mark.usefixtures("https_request")
async def test_register_with_the_real_origin_rule(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Registration is bound to the origin derived from the request."""
    ws = await hass_ws_client(hass)
    begin = await _begin(ws)
    assert begin["options"]["rp"]["id"] == "ha.example.com"
    authenticator = SoftwareAuthenticator(
        origin="https://ha.example.com", rp_id="ha.example.com"
    )

    resp = await _call(
        ws,
        "passkey/register_finish",
        challenge_id=begin["challenge_id"],
        credential=authenticator.create(begin["options"]),
    )
    assert resp["success"]
    stored = hass.data[DATA_STORE].get(authenticator.credential_id_b64)
    assert stored is not None
    assert stored.rp_id == "ha.example.com"

    begin = await _begin(ws)
    wrong_origin = SoftwareAuthenticator(
        origin="https://evil.example", rp_id="ha.example.com"
    )
    resp = await _call(
        ws,
        "passkey/register_finish",
        challenge_id=begin["challenge_id"],
        credential=wrong_origin.create(begin["options"]),
    )
    assert not resp["success"]


@pytest.mark.parametrize(
    ("host", "scheme"),
    [
        pytest.param("192.168.1.5", "https", id="ip_address"),
        pytest.param("ha.example.com", "http", id="plain_http"),
        pytest.param("ha.example.com.", "https", id="trailing_dot"),
        pytest.param("user@ha.example.com", "https", id="userinfo"),
        pytest.param("ha.example.com/path", "https", id="path"),
        pytest.param("ha.example.com?x", "https", id="query"),
        pytest.param("ha.example.com#x", "https", id="fragment"),
    ],
)
async def test_register_refused_on_an_unusable_host(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, host: str, scheme: str
) -> None:
    """Hosts WebAuthn cannot be bound to are not supported."""
    ws = await hass_ws_client(hass)

    with patch(
        "homeassistant.components.passkey.websocket.current_request"
    ) as request_context:
        request_context.get.return_value = _request_for(host, scheme)
        resp = await _call(ws, "passkey/register_begin")

    assert resp["error"]["code"] == "not_supported"


async def test_register_finish_must_see_the_same_relying_party(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A challenge started on one origin cannot be finished from another."""
    ws = await hass_ws_client(hass)
    started = RelyingParty(origin=ORIGIN, rp_id=RP_ID)
    other = RelyingParty(origin="http://localhost:9999", rp_id=RP_ID)

    with patch(
        "homeassistant.components.passkey.websocket.async_resolve_relying_party",
        side_effect=[started, other],
    ):
        begin = await _begin(ws)
        resp = await _call(
            ws,
            "passkey/register_finish",
            challenge_id=begin["challenge_id"],
            credential=_new_authenticator().create(begin["options"]),
        )

    assert not resp["success"]


@pytest.mark.usefixtures("secure_origin")
async def test_long_lived_access_token_cannot_add_a_passkey(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MockUser,
) -> None:
    """A leaked long-lived token must not turn into permanent access."""
    refresh_token = await hass.auth.async_create_refresh_token(
        hass_admin_user,
        client_name="Long lived",
        token_type=TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN,
        access_token_expiration=timedelta(days=365),
    )
    ws = await hass_ws_client(hass, hass.auth.async_create_access_token(refresh_token))

    resp = await _call(ws, "passkey/register_begin")

    assert resp["error"]["code"] == "recent_sign_in_required"


@pytest.mark.usefixtures("secure_origin")
async def test_old_session_cannot_add_a_passkey(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    freezer: FrozenDateTimeFactory,
) -> None:
    """Only a session that signed in a few minutes ago may add a passkey."""
    ws = await hass_ws_client(hass)
    assert (await _call(ws, "passkey/register_begin"))["success"]

    freezer.tick(REGISTRATION_FRESH_WINDOW + timedelta(seconds=1))

    resp = await _call(ws, "passkey/register_begin")
    assert resp["error"]["code"] == "recent_sign_in_required"


@pytest.mark.usefixtures("secure_origin")
async def test_session_that_went_stale_cannot_finish_a_registration(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MockUser,
) -> None:
    """The freshness is checked again when the registration is finished."""
    ws = await hass_ws_client(hass)
    begin = await _begin(ws)
    refresh_token = next(iter(hass_admin_user.refresh_tokens.values()))
    refresh_token.created_at = dt_util.utcnow() - REGISTRATION_FRESH_WINDOW * 2

    resp = await _call(
        ws,
        "passkey/register_finish",
        challenge_id=begin["challenge_id"],
        credential=_new_authenticator().create(begin["options"]),
    )

    assert resp["error"]["code"] == "recent_sign_in_required"
    assert (await _call(ws, "passkey/list"))["result"] == []


@pytest.mark.usefixtures("secure_origin")
async def test_a_user_keeps_only_a_few_pending_registrations(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Starting more registrations replaces the user's own oldest one."""
    ws = await hass_ws_client(hass)
    begins = [await _begin(ws) for _ in range(MAX_PENDING_REGISTRATIONS_PER_USER + 1)]

    oldest = await _call(
        ws,
        "passkey/register_finish",
        challenge_id=begins[0]["challenge_id"],
        credential=_new_authenticator().create(begins[0]["options"]),
    )
    newest = await _call(
        ws,
        "passkey/register_finish",
        challenge_id=begins[-1]["challenge_id"],
        credential=_new_authenticator().create(begins[-1]["options"]),
    )

    assert not oldest["success"]
    assert newest["success"]


@pytest.mark.usefixtures("secure_origin")
async def test_looping_register_begin_never_evicts_another_users_challenge(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    """One user starting many registrations cannot wipe another user's."""
    victim = await hass_ws_client(hass, hass_read_only_access_token)
    attacker = await hass_ws_client(hass)
    pending = await _begin(victim)

    for _ in range(100):
        await _call(attacker, "passkey/register_begin")

    resp = await _call(
        victim,
        "passkey/register_finish",
        challenge_id=pending["challenge_id"],
        credential=_new_authenticator().create(pending["options"]),
    )
    assert resp["success"]


@pytest.mark.usefixtures("secure_origin")
async def test_a_full_pool_refuses_the_newcomer(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    """When no room is left the new request fails and the old one survives."""
    first = await hass_ws_client(hass)
    second = await hass_ws_client(hass, hass_read_only_access_token)

    with patch("homeassistant.components.passkey.store.MAX_PENDING_REGISTRATIONS", 1):
        pending = await _begin(first)
        refused = await _call(second, "passkey/register_begin")

    assert refused["error"]["code"] == "not_allowed"
    resp = await _call(
        first,
        "passkey/register_finish",
        challenge_id=pending["challenge_id"],
        credential=_new_authenticator().create(pending["options"]),
    )
    assert resp["success"]


async def test_delete_all_removes_every_passkey_of_the_user(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MockUser,
) -> None:
    """The user can remove all their passkeys at once, and only theirs."""
    mine = [await create_account(hass, f"Mine {n}") for n in range(2)]
    other = await create_account(hass, "Someone else")
    store = hass.data[DATA_STORE]
    for account in mine:
        stored = store.get(account.authenticator.credential_id_b64)
        assert stored is not None
        stored.user_id = hass_admin_user.id
    ws = await hass_ws_client(hass)

    resp = await _call(ws, "passkey/delete_all")

    assert resp["result"] == {"removed": 2}
    assert store.for_user(hass_admin_user.id) == []
    assert len(store.for_user(other.user.id)) == 1


async def test_delete_all_of_another_user(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
    account: Account,
) -> None:
    """Only an administrator can remove another user's passkeys."""
    denied = await _call(
        await hass_ws_client(hass, hass_read_only_access_token),
        "passkey/delete_all",
        user_id=account.user.id,
    )
    assert denied["error"]["code"] == "unauthorized"
    assert len(hass.data[DATA_STORE].for_user(account.user.id)) == 1

    allowed = await _call(
        await hass_ws_client(hass), "passkey/delete_all", user_id=account.user.id
    )
    assert allowed["result"] == {"removed": 1}


async def _ws_with_credential_of(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    user: MockUser,
    provider_type: str | None,
) -> MockHAClientWebSocket:
    credential = (
        None
        if provider_type is None
        else Credentials(
            auth_provider_type=provider_type,
            auth_provider_id=None,
            data={},
            is_new=False,
        )
    )
    if credential is not None:
        user.credentials.append(credential)
    refresh_token = await hass.auth.async_create_refresh_token(
        user, "https://example.com/", credential=credential
    )
    return await hass_ws_client(hass, hass.auth.async_create_access_token(refresh_token))


@pytest.mark.usefixtures("secure_origin")
@pytest.mark.parametrize(
    "provider_type",
    [
        pytest.param("insecure_example", id="other_provider"),
        pytest.param(None, id="no_credential"),
    ],
)
async def test_session_without_a_password_login_cannot_change_passkeys(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MockUser,
    account: Account,
    provider_type: str | None,
) -> None:
    """A session that never proved a secret may not add or remove passkeys."""
    ws = await _ws_with_credential_of(
        hass, hass_ws_client, hass_admin_user, provider_type
    )
    credential_id = account.authenticator.credential_id_b64

    begin = await _call(ws, "passkey/register_begin")
    delete = await _call(
        ws, "passkey/delete", credential_id=credential_id, user_id=account.user.id
    )
    delete_all = await _call(ws, "passkey/delete_all", user_id=account.user.id)

    for resp in (begin, delete, delete_all):
        assert resp["error"]["code"] == "recent_sign_in_required"
    assert hass.data[DATA_STORE].get(credential_id) is not None


async def test_stale_or_long_lived_session_cannot_remove_passkeys(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MockUser,
    account: Account,
    freezer: FrozenDateTimeFactory,
) -> None:
    """Removing a passkey needs the same fresh sign-in as adding one."""
    credential_id = account.authenticator.credential_id_b64
    ws = await hass_ws_client(hass)
    freezer.tick(REGISTRATION_FRESH_WINDOW + timedelta(seconds=1))

    stale = [
        await _call(
            ws, "passkey/delete", credential_id=credential_id, user_id=account.user.id
        ),
        await _call(ws, "passkey/delete_all", user_id=account.user.id),
    ]
    long_lived = await hass.auth.async_create_refresh_token(
        hass_admin_user,
        client_name="Long lived",
        token_type=TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN,
        access_token_expiration=timedelta(days=365),
    )
    ws_long = await hass_ws_client(
        hass, hass.auth.async_create_access_token(long_lived)
    )
    stale += [
        await _call(
            ws_long,
            "passkey/delete",
            credential_id=credential_id,
            user_id=account.user.id,
        ),
        await _call(ws_long, "passkey/delete_all", user_id=account.user.id),
    ]

    assert [resp["error"]["code"] for resp in stale] == ["recent_sign_in_required"] * 4
    assert hass.data[DATA_STORE].get(credential_id) is not None
    renamed = await _call(
        ws, "passkey/rename", credential_id=credential_id, name="Kept",
        user_id=account.user.id,
    )
    assert renamed["success"]
