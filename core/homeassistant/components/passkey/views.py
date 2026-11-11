"""Unauthenticated HTTP views for signing in with a passkey."""

import base64
import binascii
from http import HTTPStatus
import logging
from typing import Any

from aiohttp import web
import probatio

from homeassistant.auth.models import Credentials, User
from homeassistant.components import onboarding
from homeassistant.components.auth import DATA_STORE as AUTH_CODE_STORE, indieauth
from homeassistant.components.http import KEY_HASS, HomeAssistantView
from homeassistant.components.http.auth_util import async_user_not_allowed_do_auth
from homeassistant.components.http.ban import log_invalid_auth, process_success_login
from homeassistant.components.http.const import MAX_UNAUTHENTICATED_BODY_SIZE
from homeassistant.components.http.data_validator import RequestDataValidator
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from .ceremony import (
    CeremonyError,
    build_authentication_options,
    counter_regressed,
    new_challenge,
    user_handle,
    verify_assertion,
)
from .const import (
    BEGIN_URL,
    FINISH_URL,
    MAX_TOKEN_LENGTH,
    SIGN_IN_FAILED_MESSAGE,
    STATUS_URL,
    UNAVAILABLE_MESSAGE,
)
from .origin import async_resolve_relying_party
from .sign_in_token import remote_key
from .store import DATA_STORE

_LOGGER = logging.getLogger(__name__)

MAX_URL_LENGTH = 2048
PREFERRED_PROVIDER_TYPE = "homeassistant"


@callback
def async_register_views(hass: HomeAssistant) -> None:
    """Register the sign-in views."""
    hass.http.register_view(PasskeyStatusView)
    hass.http.register_view(PasskeyBeginView)
    hass.http.register_view(PasskeyFinishView)


def _sign_in_failed(view: HomeAssistantView) -> web.Response:
    """Return the one response every refusal of a finished sign-in uses."""
    return view.json_message(SIGN_IN_FAILED_MESSAGE, HTTPStatus.UNAUTHORIZED)


def _unavailable(view: HomeAssistantView) -> web.Response:
    """Return the response for an address or setup passkeys cannot be used on.

    It is deliberately not a failed login: it says nothing about the person
    and must never count towards banning their address.
    """
    return view.json_message(UNAVAILABLE_MESSAGE, HTTPStatus.BAD_REQUEST)


def _decode_base64url(value: object) -> bytes | None:
    if not isinstance(value, str):
        return None
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except binascii.Error, ValueError:
        return None


def _pick_credential(user: User) -> Credentials | None:
    """Return the credential the login code is issued for."""
    for credential in user.credentials:
        if credential.auth_provider_type == PREFERRED_PROVIDER_TYPE:
            return credential
    return user.credentials[0] if user.credentials else None


class PasskeyStatusView(HomeAssistantView):
    """Tell the sign-in page whether passkeys can be used on this address."""

    url = STATUS_URL
    name = "api:auth:passkey:status"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        """Return whether a sign-in could be started from this request."""
        hass = request.app[KEY_HASS]
        available = (
            onboarding.async_is_user_onboarded(hass)
            and async_resolve_relying_party(request) is not None
            and remote_key(request.remote) is not None
        )
        return self.json(
            {"available": available}, headers={"Cache-Control": "no-store"}
        )


class PasskeyBeginView(HomeAssistantView):
    """Start a passkey sign-in."""

    url = BEGIN_URL
    name = "api:auth:passkey:begin"
    requires_auth = False
    max_body_size = MAX_UNAUTHENTICATED_BODY_SIZE

    @RequestDataValidator(
        probatio.Schema(
            {
                probatio.Required("client_id"): probatio.All(
                    str, probatio.Length(max=MAX_URL_LENGTH)
                ),
                probatio.Required("redirect_uri"): probatio.All(
                    str, probatio.Length(max=MAX_URL_LENGTH)
                ),
                probatio.Optional("code_challenge"): probatio.Match(
                    r"^[A-Za-z0-9_-]{43}\Z"
                ),
                probatio.Optional("code_challenge_method"): str,
            }
        )
    )
    async def post(self, request: web.Request, data: dict[str, Any]) -> web.Response:
        """Return a signed challenge. No account is named, so nothing about accounts leaks.

        Nothing is stored and nothing here is a failed login, so a refusal is
        never counted towards banning the address.
        """
        hass = request.app[KEY_HASS]

        if not onboarding.async_is_user_onboarded(hass):
            return _unavailable(self)

        client_id: str = data["client_id"]
        if not indieauth.verify_client_id(
            client_id, request_scheme=request.scheme, request_netloc=request.host
        ):
            return self.json_message("Invalid client id", HTTPStatus.BAD_REQUEST)

        code_challenge = data.get("code_challenge")
        code_challenge_method = data.get("code_challenge_method")
        if code_challenge is not None and code_challenge_method != "S256":
            return self.json_message(
                "Transform algorithm not supported", HTTPStatus.BAD_REQUEST
            )
        if code_challenge is None and code_challenge_method is not None:
            return self.json_message(
                "code_challenge required when code_challenge_method is provided",
                HTTPStatus.BAD_REQUEST,
            )

        if (relying_party := async_resolve_relying_party(request)) is None:
            return _unavailable(self)

        if (remote := remote_key(request.remote)) is None:
            return _unavailable(self)

        challenge = new_challenge()
        token = hass.data[DATA_STORE].sign_in_tokens.issue(
            challenge=challenge,
            remote=remote,
            relying_party=relying_party,
            client_id=client_id,
            redirect_uri=data["redirect_uri"],
            code_challenge=code_challenge,
            code_challenge_method=code_challenge_method,
        )
        return self.json(
            {
                "challenge_id": token,
                "options": build_authentication_options(
                    relying_party=relying_party, challenge=challenge
                ),
            },
            headers={"Cache-Control": "no-store"},
        )


class PasskeyFinishView(HomeAssistantView):
    """Finish a passkey sign-in and hand over an authorization code."""

    url = FINISH_URL
    name = "api:auth:passkey:finish"
    requires_auth = False
    max_body_size = MAX_UNAUTHENTICATED_BODY_SIZE

    @RequestDataValidator(
        probatio.Schema(
            {
                probatio.Required("challenge_id"): probatio.All(
                    str, probatio.Length(min=1, max=MAX_TOKEN_LENGTH)
                ),
                probatio.Required("credential"): dict,
            }
        )
    )
    @log_invalid_auth
    async def post(self, request: web.Request, data: dict[str, Any]) -> web.Response:
        """Verify the assertion."""
        hass = request.app[KEY_HASS]
        store = hass.data[DATA_STORE]

        pending = store.sign_in_tokens.verify(data["challenge_id"])
        if pending is None or not store.sign_in_tokens.consume(pending):
            return _sign_in_failed(self)

        if (
            pending.remote != remote_key(request.remote)
            or async_resolve_relying_party(request) != pending.relying_party
        ):
            return _sign_in_failed(self)

        credential: dict[str, Any] = data["credential"]
        response = credential.get("response")
        raw_id = credential.get("rawId")
        stored = store.get(raw_id) if isinstance(raw_id, str) else None
        handle = (
            _decode_base64url(response.get("userHandle"))
            if isinstance(response, dict)
            else None
        )
        if (
            stored is None
            or credential.get("id") != raw_id
            or handle is None
            or stored.rp_id != pending.relying_party.rp_id
        ):
            return _sign_in_failed(self)

        user = await hass.auth.async_get_user(stored.user_id)
        if (
            user is None
            or handle != user_handle(user)
            or async_user_not_allowed_do_auth(hass, user, request)
            or (auth_credential := _pick_credential(user)) is None
        ):
            return _sign_in_failed(self)

        try:
            verified = verify_assertion(
                credential=credential,
                challenge=pending.challenge,
                relying_party=pending.relying_party,
                stored=stored,
            )
        except CeremonyError:
            return _sign_in_failed(self)

        # No await between the counter check and the update: two assertions
        # carrying the same counter cannot both pass.
        if counter_regressed(stored.sign_count, verified.new_sign_count):
            _LOGGER.warning(
                "A passkey reported a sign counter that did not increase, "
                "so the sign-in was refused. The authenticator may have been cloned"
            )
            return _sign_in_failed(self)
        stored.sign_count = verified.new_sign_count
        stored.last_used = dt_util.utcnow().isoformat()
        await store.async_save_changes()

        if not await indieauth.verify_redirect_uri(
            hass,
            pending.client_id,
            pending.redirect_uri,
            allow_loopback_port_change=pending.code_challenge is not None,
            request_scheme=request.scheme,
            request_netloc=request.host,
        ):
            return self.json_message("Invalid redirect URI", HTTPStatus.FORBIDDEN)

        process_success_login(request)
        code = hass.data[AUTH_CODE_STORE](
            pending.client_id,
            auth_credential,
            code_challenge=pending.code_challenge,
            code_challenge_method=pending.code_challenge_method,
        )
        return self.json(
            {"type": "create_entry", "result": code},
            headers={"Cache-Control": "no-store"},
        )
