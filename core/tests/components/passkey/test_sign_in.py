"""Tests for signing in with a passkey."""

import asyncio
from datetime import timedelta
import hashlib
from http import HTTPStatus
import logging
from typing import Any
from unittest.mock import AsyncMock, patch

from aiohttp import ClientResponse
from aiohttp.test_utils import TestClient
from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import CLIENT_ID, CLIENT_REDIRECT_URI
from pytest_homeassistant.typing import ClientSessionGenerator

from homeassistant.components.passkey.const import (
    BEGIN_URL,
    FINISH_URL,
    SIGN_IN_FAILED_MESSAGE,
    STATUS_URL,
    UNAVAILABLE_MESSAGE,
)
from homeassistant.components.passkey.sign_in_token import SignInTokens
from homeassistant.components.passkey.store import DATA_STORE
from homeassistant.core import HomeAssistant

from .authenticator import SoftwareAuthenticator, b64url
from .conftest import Account, create_account

from tests.test_util import mock_real_ip

LOCALHOST = {"Host": "localhost"}
VERIFIER = "v" * 64


async def _begin(
    client: TestClient,
    headers: dict[str, str] | None = None,
    **extra: Any,
) -> ClientResponse:
    return await client.post(
        BEGIN_URL,
        json={"client_id": CLIENT_ID, "redirect_uri": CLIENT_REDIRECT_URI, **extra},
        headers=LOCALHOST if headers is None else headers,
    )


async def _finish(
    client: TestClient, challenge_id: str, credential: dict[str, Any]
) -> ClientResponse:
    return await client.post(
        FINISH_URL,
        json={"challenge_id": challenge_id, "credential": credential},
        headers=LOCALHOST,
    )


async def _sign_in(
    client: TestClient,
    authenticator: SoftwareAuthenticator,
    user_handle: bytes,
    **overrides: Any,
) -> ClientResponse:
    begin = await _begin(client)
    assert begin.status == HTTPStatus.OK
    body = await begin.json()
    assertion = authenticator.get(body["options"], user_handle=user_handle, **overrides)
    return await _finish(client, body["challenge_id"], assertion)


async def _assert_refused(resp: ClientResponse) -> None:
    assert resp.status == HTTPStatus.UNAUTHORIZED
    assert await resp.json() == {"message": SIGN_IN_FAILED_MESSAGE}


async def test_sign_in_issues_a_code_for_the_existing_login_machinery(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """A valid assertion ends in an authorization code the token view accepts."""
    client = await hass_client_no_auth()

    resp = await _sign_in(client, account.authenticator, account.handle)
    assert resp.status == HTTPStatus.OK
    code = (await resp.json())["result"]

    token_resp = await client.post(
        "/auth/token",
        data={
            "client_id": CLIENT_ID,
            "grant_type": "authorization_code",
            "code": code,
        },
    )
    assert token_resp.status == HTTPStatus.OK
    tokens = await token_resp.json()
    assert tokens["ha_auth_provider"] == "insecure_example"
    refresh_token = hass.auth.async_validate_access_token(tokens["access_token"])
    assert refresh_token is not None
    assert refresh_token.user.id == account.user.id

    stored = hass.data[DATA_STORE].get(account.authenticator.credential_id_b64)
    assert stored is not None
    assert stored.sign_count == 1
    assert stored.last_used is not None


async def test_code_can_only_be_used_with_the_pkce_verifier(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """The code challenge given at the start is enforced by the token view."""
    client = await hass_client_no_auth()
    challenge = b64url(hashlib.sha256(VERIFIER.encode()).digest())

    begin = await _begin(client, code_challenge=challenge, code_challenge_method="S256")
    body = await begin.json()
    assertion = account.authenticator.get(body["options"], user_handle=account.handle)
    resp = await _finish(client, body["challenge_id"], assertion)
    code = (await resp.json())["result"]

    missing = await client.post(
        "/auth/token",
        data={"client_id": CLIENT_ID, "grant_type": "authorization_code", "code": code},
    )
    assert missing.status == HTTPStatus.BAD_REQUEST

    good = await _begin(client, code_challenge=challenge, code_challenge_method="S256")
    body = await good.json()
    assertion = account.authenticator.get(body["options"], user_handle=account.handle)
    code = (await (await _finish(client, body["challenge_id"], assertion)).json())[
        "result"
    ]
    ok = await client.post(
        "/auth/token",
        data={
            "client_id": CLIENT_ID,
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": VERIFIER,
        },
    )
    assert ok.status == HTTPStatus.OK


async def test_begin_names_no_account(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """The options never list credentials or users."""
    client = await hass_client_no_auth()

    body = await (await _begin(client)).json()

    assert body["options"]["allowCredentials"] == []
    assert body["options"]["userVerification"] == "required"
    assert body["options"]["rpId"] == "localhost"
    assert account.user.id not in str(body)
    assert account.authenticator.credential_id_b64 not in str(body)


async def test_begin_looks_the_same_without_any_passkey(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
) -> None:
    """Whether any passkey exists cannot be told from the begin response."""
    client = await hass_client_no_auth()

    body = await (await _begin(client)).json()

    assert sorted(body) == ["challenge_id", "options"]
    assert body["options"]["allowCredentials"] == []


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"challenge": b64url(b"x" * 32)}, id="wrong_challenge"),
        pytest.param({"origin": "https://evil.example"}, id="wrong_origin"),
        pytest.param({"rp_id": "example.com"}, id="wrong_rp_id"),
        pytest.param({"user_verified": False}, id="user_verification_missing"),
    ],
)
async def test_sign_in_refused(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
    overrides: dict[str, Any],
) -> None:
    """A bad assertion is refused and changes nothing."""
    client = await hass_client_no_auth()

    resp = await _sign_in(client, account.authenticator, account.handle, **overrides)

    await _assert_refused(resp)
    stored = hass.data[DATA_STORE].get(account.authenticator.credential_id_b64)
    assert stored is not None
    assert stored.sign_count == 0
    assert stored.last_used is None


async def test_challenge_is_single_use(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """A challenge cannot be replayed, not even with the same valid assertion."""
    client = await hass_client_no_auth()
    body = await (await _begin(client)).json()
    assertion = account.authenticator.get(body["options"], user_handle=account.handle)

    first = await _finish(client, body["challenge_id"], assertion)
    second = await _finish(client, body["challenge_id"], assertion)

    assert first.status == HTTPStatus.OK
    await _assert_refused(second)


async def test_challenge_is_spent_by_a_failed_attempt(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """A refused attempt also uses up its challenge."""
    client = await hass_client_no_auth()
    body = await (await _begin(client)).json()
    bad = account.authenticator.get(
        body["options"], user_handle=account.handle, user_verified=False
    )
    good = account.authenticator.get(body["options"], user_handle=account.handle)

    await _assert_refused(await _finish(client, body["challenge_id"], bad))
    await _assert_refused(await _finish(client, body["challenge_id"], good))


async def test_challenge_expires(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
    freezer: FrozenDateTimeFactory,
) -> None:
    """An old challenge is refused."""
    client = await hass_client_no_auth()
    body = await (await _begin(client)).json()
    assertion = account.authenticator.get(body["options"], user_handle=account.handle)

    freezer.tick(timedelta(minutes=6))

    await _assert_refused(await _finish(client, body["challenge_id"], assertion))


async def test_unknown_challenge(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """A challenge id the server never issued is refused."""
    client = await hass_client_no_auth()
    body = await (await _begin(client)).json()
    assertion = account.authenticator.get(body["options"], user_handle=account.handle)

    await _assert_refused(await _finish(client, "not-issued", assertion))


@pytest.mark.parametrize("counter", [3, 5], ids=["lower", "equal"])
async def test_counter_regression_is_refused(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
    caplog: pytest.LogCaptureFixture,
    counter: int,
) -> None:
    """A counter that did not move forward is refused and warned about."""
    stored = hass.data[DATA_STORE].get(account.authenticator.credential_id_b64)
    assert stored is not None
    stored.sign_count = 5
    client = await hass_client_no_auth()

    with caplog.at_level(logging.WARNING):
        resp = await _sign_in(
            client, account.authenticator, account.handle, counter=counter
        )

    await _assert_refused(resp)
    assert "sign counter" in caplog.text
    assert account.authenticator.credential_id_b64 not in caplog.text
    assert stored.sign_count == 5


async def test_counter_that_stays_zero_is_accepted(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """Authenticators without a counter always report zero."""
    client = await hass_client_no_auth()

    resp = await _sign_in(client, account.authenticator, account.handle, counter=0)

    assert resp.status == HTTPStatus.OK


async def test_inactive_user_is_refused(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """A deactivated user cannot sign in with a passkey."""
    await hass.auth.async_deactivate_user(account.user)
    client = await hass_client_no_auth()

    resp = await _sign_in(client, account.authenticator, account.handle)

    await _assert_refused(resp)


async def test_deleted_credential_is_refused(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """A passkey that was removed no longer works."""
    await hass.data[DATA_STORE].async_remove(account.authenticator.credential_id_b64)
    client = await hass_client_no_auth()

    resp = await _sign_in(client, account.authenticator, account.handle)

    await _assert_refused(resp)


async def test_another_users_handle_is_refused(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """A credential only signs in the user it belongs to."""
    other = await create_account(hass, "Other User")
    client = await hass_client_no_auth()

    resp = await _sign_in(client, other.authenticator, account.handle)

    await _assert_refused(resp)


async def test_refusals_cannot_be_told_apart(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """Unknown credential, inactive user and bad signature look identical."""
    inactive = await create_account(hass, "Inactive User")
    await hass.auth.async_deactivate_user(inactive.user)
    unknown = await create_account(hass, "Unknown", register=False)
    client = await hass_client_no_auth()

    responses = [
        await _sign_in(client, unknown.authenticator, unknown.handle),
        await _sign_in(client, inactive.authenticator, inactive.handle),
        await _sign_in(
            client, account.authenticator, account.handle, user_verified=False
        ),
        await _finish(client, "not-issued", {}),
    ]

    outcomes = {(resp.status, await resp.text()) for resp in responses}
    assert outcomes == {
        (HTTPStatus.UNAUTHORIZED, f'{{"message":"{SIGN_IN_FAILED_MESSAGE}"}}')
    }




@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="ip_host"),
        pytest.param(
            {"Host": "localhost", "Origin": "http://evil.example"}, id="origin"
        ),
        pytest.param({"Host": "user@localhost"}, id="host_with_userinfo"),
    ],
)
async def test_begin_refusals_are_not_failed_logins(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    headers: dict[str, str],
) -> None:
    """An unusable address is answered distinctly and never counts towards a ban."""
    client = await hass_client_no_auth()

    with patch(
        "homeassistant.components.http.ban.process_wrong_login", AsyncMock()
    ) as wrong_login:
        resp = await _begin(client, headers=headers)

    assert resp.status == HTTPStatus.BAD_REQUEST
    assert await resp.json() == {"message": UNAVAILABLE_MESSAGE}
    wrong_login.assert_not_awaited()


async def test_begin_with_a_wrong_client_id_is_not_a_failed_login(
    hass: HomeAssistant, hass_client_no_auth: ClientSessionGenerator
) -> None:
    """A configuration refusal from begin never counts towards a ban."""
    client = await hass_client_no_auth()

    with patch(
        "homeassistant.components.http.ban.process_wrong_login", AsyncMock()
    ) as wrong_login:
        resp = await client.post(
            BEGIN_URL,
            json={"client_id": "not-a-url", "redirect_uri": "https://x"},
            headers=LOCALHOST,
        )

    assert resp.status == HTTPStatus.BAD_REQUEST
    wrong_login.assert_not_awaited()


async def test_refused_finish_is_a_failed_login(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """A refused sign-in does count towards a ban."""
    client = await hass_client_no_auth()

    with patch(
        "homeassistant.components.http.ban.process_wrong_login", AsyncMock()
    ) as wrong_login:
        resp = await _sign_in(
            client, account.authenticator, account.handle, user_verified=False
        )

    await _assert_refused(resp)
    wrong_login.assert_awaited_once()


@pytest.mark.parametrize(
    ("headers", "available"),
    [
        pytest.param(LOCALHOST, True, id="localhost"),
        pytest.param({}, False, id="ip_host"),
        pytest.param(
            {"Host": "localhost", "Origin": "http://evil"}, False, id="origin"
        ),
    ],
)
async def test_status_reports_whether_passkeys_can_be_used(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    headers: dict[str, str],
    available: bool,
) -> None:
    """The sign-in page can ask before it shows the button."""
    client = await hass_client_no_auth()

    resp = await client.get(STATUS_URL, headers=headers)

    assert resp.status == HTTPStatus.OK
    assert await resp.json() == {"available": available}


async def test_begin_stores_nothing_on_the_server(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
) -> None:
    """Any number of begin calls leaves the stored state untouched."""
    store = hass.data[DATA_STORE]
    client = await hass_client_no_auth()

    for _ in range(20):
        assert (await _begin(client)).status == HTTPStatus.OK

    assert store.sign_in_tokens._used == {}


async def test_tampered_token_is_refused(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """A token whose content or signature changed is refused."""
    client = await hass_client_no_auth()
    body = await (await _begin(client)).json()
    assertion = account.authenticator.get(body["options"], user_handle=account.handle)
    payload, _, signature = body["challenge_id"].partition(".")

    await _assert_refused(await _finish(client, f"{payload}x.{signature}", assertion))
    await _assert_refused(
        await _finish(client, f"{payload}.{signature[:-2]}AA", assertion)
    )
    await _assert_refused(await _finish(client, payload, assertion))


async def test_token_from_another_start_is_refused(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """A token signed with a different key, as after a restart, is refused."""
    client = await hass_client_no_auth()
    body = await (await _begin(client)).json()
    assertion = account.authenticator.get(body["options"], user_handle=account.handle)
    hass.data[DATA_STORE].sign_in_tokens = SignInTokens()

    await _assert_refused(await _finish(client, body["challenge_id"], assertion))


@pytest.mark.parametrize(
    ("begin_ip", "finish_ip", "accepted"),
    [
        pytest.param("203.0.113.5", "203.0.113.5", True, id="same_address"),
        pytest.param("203.0.113.5", "203.0.113.6", False, id="other_address"),
        pytest.param("2001:db8:1:2::1", "2001:db8:1:2:ffff::9", True, id="same_v6_64"),
        pytest.param("2001:db8:1:2::1", "2001:db8:1:3::1", False, id="other_v6_64"),
    ],
)
async def test_challenge_is_bound_to_the_remote(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
    begin_ip: str,
    finish_ip: str,
    accepted: bool,
) -> None:
    """A challenge only finishes from where it started, an IPv6 /64 being one place."""
    set_ip = mock_real_ip(hass.http.app)
    client = await hass_client_no_auth()
    set_ip(begin_ip)
    body = await (await _begin(client)).json()
    assertion = account.authenticator.get(body["options"], user_handle=account.handle)

    set_ip(finish_ip)
    resp = await _finish(client, body["challenge_id"], assertion)

    assert (resp.status == HTTPStatus.OK) is accepted


async def test_local_only_user_is_refused_from_a_remote_address(
    hass: HomeAssistant, hass_client_no_auth: ClientSessionGenerator
) -> None:
    """A user restricted to the local network cannot sign in from outside."""
    local = await create_account(hass, "Local User", local_only=True)
    set_ip = mock_real_ip(hass.http.app)
    client = await hass_client_no_auth()

    set_ip("192.168.1.20")
    assert (
        await _sign_in(client, local.authenticator, local.handle)
    ).status == HTTPStatus.OK

    set_ip("203.0.113.5")
    await _assert_refused(await _sign_in(client, local.authenticator, local.handle))


async def test_unusable_redirect_uri_is_forbidden(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """A redirect URI the client id does not allow gets no code."""
    client = await hass_client_no_auth()

    with patch(
        "homeassistant.components.passkey.views.indieauth.verify_redirect_uri",
        AsyncMock(return_value=False),
    ):
        resp = await _sign_in(client, account.authenticator, account.handle)

    assert resp.status == HTTPStatus.FORBIDDEN
    assert await resp.json() == {"message": "Invalid redirect URI"}


async def test_credential_is_the_password_provider_one_when_present(
    hass: HomeAssistant, hass_client_no_auth: ClientSessionGenerator
) -> None:
    """The login code is issued for the password credential, not the first one."""
    account = await create_account(
        hass, "Two Providers", provider_types=("insecure_example", "homeassistant")
    )
    client = await hass_client_no_auth()

    resp = await _sign_in(client, account.authenticator, account.handle)
    token_resp = await client.post(
        "/auth/token",
        data={
            "client_id": CLIENT_ID,
            "grant_type": "authorization_code",
            "code": (await resp.json())["result"],
        },
    )

    assert (await token_resp.json())["ha_auth_provider"] == "homeassistant"


async def test_first_credential_is_used_without_a_password_one(
    hass: HomeAssistant, hass_client_no_auth: ClientSessionGenerator
) -> None:
    """A user with only another provider's credential still signs in."""
    account = await create_account(hass, "Other Provider")
    client = await hass_client_no_auth()

    resp = await _sign_in(client, account.authenticator, account.handle)

    assert resp.status == HTTPStatus.OK


async def test_user_without_credentials_is_refused(
    hass: HomeAssistant, hass_client_no_auth: ClientSessionGenerator
) -> None:
    """A user no login provider knows cannot be signed in."""
    account = await create_account(hass, "No Credentials", provider_types=())
    client = await hass_client_no_auth()

    resp = await _sign_in(client, account.authenticator, account.handle)

    await _assert_refused(resp)


async def test_the_same_counter_cannot_pass_twice(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    account: Account,
) -> None:
    """Two concurrent assertions carrying one counter value: only one succeeds."""
    client = await hass_client_no_auth()
    assertions = []
    for _ in range(2):
        body = await (await _begin(client)).json()
        assertions.append(
            (
                body["challenge_id"],
                account.authenticator.get(
                    body["options"], user_handle=account.handle, counter=1
                ),
            )
        )

    async def slow_redirect_check(*args: Any, **kwargs: Any) -> bool:
        await asyncio.sleep(0.05)
        return True

    with patch(
        "homeassistant.components.passkey.views.indieauth.verify_redirect_uri",
        slow_redirect_check,
    ):
        responses = await asyncio.gather(
            *(_finish(client, token, assertion) for token, assertion in assertions)
        )

    assert sorted(resp.status for resp in responses) == [
        HTTPStatus.OK,
        HTTPStatus.UNAUTHORIZED,
    ]
    stored = hass.data[DATA_STORE].get(account.authenticator.credential_id_b64)
    assert stored is not None
    assert stored.sign_count == 1
