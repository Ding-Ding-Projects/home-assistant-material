"""WebSocket API of the Passkey integration."""

from typing import Any

import probatio

from homeassistant.auth.models import TOKEN_TYPE_NORMAL
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.http import current_request
from homeassistant.util import dt as dt_util

from .ceremony import (
    CeremonyError,
    build_registration_options,
    new_challenge,
    verify_registration,
)
from .const import (
    DEFAULT_PASSKEY_NAME,
    ERR_RECENT_SIGN_IN_REQUIRED,
    MAX_NAME_LENGTH,
    MAX_PASSKEYS_PER_USER,
    REGISTRATION_FRESH_WINDOW,
)
from .origin import async_resolve_relying_party
from .store import DATA_STORE, PasskeyCredential, PasskeyStore

_NAME = probatio.All(str, probatio.Length(max=256))
PASSWORD_PROVIDER_TYPE = "homeassistant"
REMOVE_SIGN_IN_MESSAGE = "Sign in again to remove a passkey"


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Register the commands."""
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_rename)
    websocket_api.async_register_command(hass, ws_delete)
    websocket_api.async_register_command(hass, ws_delete_all)
    websocket_api.async_register_command(hass, ws_register_begin)
    websocket_api.async_register_command(hass, ws_register_finish)


def _clean_name(raw: str | None) -> str | None:
    """Return a tidy display name, or None when it holds control characters."""
    if raw is None:
        return DEFAULT_PASSKEY_NAME
    if not raw.isprintable():
        return None
    return " ".join(raw.split())[:MAX_NAME_LENGTH] or DEFAULT_PASSKEY_NAME


def _target_user_id(
    connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> str | None:
    """Return the user a command acts on, or None when it is not allowed.

    A user always manages their own passkeys, an administrator any user's.
    """
    user_id: str = msg.get("user_id", connection.user.id)
    if user_id != connection.user.id and not connection.user.is_admin:
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Unauthorized")
        return None
    return user_id


def _signed_in_recently(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection
) -> bool:
    """Return True when this connection belongs to a fresh interactive sign-in.

    A passkey outlives every session, so only a normal session that was created
    a moment ago may add or remove one. A long-lived access token never can.
    The session must also come from a password login: a provider that asks for
    no secret, such as trusted networks, proves nothing about the person.
    """
    if connection.refresh_token_id is None:
        return False
    refresh_token = hass.auth.async_get_refresh_token(connection.refresh_token_id)
    return (
        refresh_token is not None
        and refresh_token.token_type == TOKEN_TYPE_NORMAL
        and refresh_token.credential is not None
        and refresh_token.credential.auth_provider_type == PASSWORD_PROVIDER_TYPE
        and dt_util.utcnow() - refresh_token.created_at <= REGISTRATION_FRESH_WINDOW
    )


def _send_sign_in_required(
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    message: str = "Sign in again to add a passkey",
) -> None:
    connection.send_error(msg["id"], ERR_RECENT_SIGN_IN_REQUIRED, message)


def _owned_credential(
    store: PasskeyStore,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> PasskeyCredential | None:
    """Return the passkey a command names, or answer that it was not found."""
    if (user_id := _target_user_id(connection, msg)) is None:
        return None
    credential = store.get(msg["credential_id"])
    if credential is None or credential.user_id != user_id:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "Passkey not found"
        )
        return None
    return credential


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "passkey/list",
        probatio.Optional("user_id"): str,
    }
)
@websocket_api.ws_require_user(allow_system_user=False)
@callback
def ws_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """List the passkeys of a user."""
    if (user_id := _target_user_id(connection, msg)) is None:
        return
    connection.send_result(
        msg["id"],
        [item.as_public_dict() for item in hass.data[DATA_STORE].for_user(user_id)],
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "passkey/rename",
        probatio.Required("credential_id"): str,
        probatio.Required("name"): _NAME,
        probatio.Optional("user_id"): str,
    }
)
@websocket_api.ws_require_user(allow_system_user=False)
@websocket_api.async_response
async def ws_rename(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Rename a passkey."""
    store = hass.data[DATA_STORE]
    if (credential := _owned_credential(store, connection, msg)) is None:
        return
    if (name := _clean_name(msg["name"])) is None:
        connection.send_error(
            msg["id"], websocket_api.ERR_INVALID_FORMAT, "Invalid name"
        )
        return
    credential.name = name
    await store.async_save_changes()
    connection.send_result(msg["id"], credential.as_public_dict())


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "passkey/delete",
        probatio.Required("credential_id"): str,
        probatio.Optional("user_id"): str,
    }
)
@websocket_api.ws_require_user(allow_system_user=False)
@websocket_api.async_response
async def ws_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Delete a passkey."""
    if not _signed_in_recently(hass, connection):
        _send_sign_in_required(connection, msg, REMOVE_SIGN_IN_MESSAGE)
        return
    store = hass.data[DATA_STORE]
    if (credential := _owned_credential(store, connection, msg)) is None:
        return
    await store.async_remove(credential.id)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "passkey/delete_all",
        probatio.Optional("user_id"): str,
    }
)
@websocket_api.ws_require_user(allow_system_user=False)
@websocket_api.async_response
async def ws_delete_all(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Delete every passkey of a user."""
    if not _signed_in_recently(hass, connection):
        _send_sign_in_required(connection, msg, REMOVE_SIGN_IN_MESSAGE)
        return
    if (user_id := _target_user_id(connection, msg)) is None:
        return
    removed = await hass.data[DATA_STORE].async_remove_user(user_id)
    connection.send_result(msg["id"], {"removed": removed})


@websocket_api.websocket_command({probatio.Required("type"): "passkey/register_begin"})
@websocket_api.ws_require_user(allow_system_user=False)
@callback
def ws_register_begin(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Start adding a passkey to the signed-in user."""
    store = hass.data[DATA_STORE]
    user = connection.user

    if not _signed_in_recently(hass, connection):
        _send_sign_in_required(connection, msg)
        return

    if (relying_party := async_resolve_relying_party(current_request.get())) is None:
        connection.send_error(
            msg["id"],
            websocket_api.ERR_NOT_SUPPORTED,
            "Passkeys need a secure https address with a domain name",
        )
        return

    existing = store.for_user(user.id)
    if len(existing) >= MAX_PASSKEYS_PER_USER:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_ALLOWED, "Too many passkeys"
        )
        return

    challenge = new_challenge()
    challenge_id = store.add_registration(
        challenge=challenge,
        relying_party=relying_party,
        user_id=user.id,
        connection=connection,
    )
    if challenge_id is None:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_ALLOWED, "Too many pending requests"
        )
        return
    connection.send_result(
        msg["id"],
        {
            "challenge_id": challenge_id,
            "options": build_registration_options(
                relying_party=relying_party,
                user=user,
                existing=existing,
                challenge=challenge,
            ),
        },
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "passkey/register_finish",
        probatio.Required("challenge_id"): probatio.All(
            str, probatio.Length(min=1, max=128)
        ),
        probatio.Required("credential"): dict,
        probatio.Optional("name"): _NAME,
    }
)
@websocket_api.ws_require_user(allow_system_user=False)
@websocket_api.async_response
async def ws_register_finish(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Finish adding a passkey."""
    store = hass.data[DATA_STORE]
    user = connection.user

    pending = store.pop_registration(msg["challenge_id"])
    if not _signed_in_recently(hass, connection):
        _send_sign_in_required(connection, msg)
        return
    relying_party = async_resolve_relying_party(current_request.get())
    if (
        pending is None
        or pending.user_id != user.id
        or pending.connection is not connection
        or relying_party is None
        or relying_party != pending.relying_party
    ):
        connection.send_error(
            msg["id"], websocket_api.ERR_INVALID_FORMAT, "Passkey registration failed"
        )
        return

    if (name := _clean_name(msg.get("name"))) is None:
        connection.send_error(
            msg["id"], websocket_api.ERR_INVALID_FORMAT, "Invalid name"
        )
        return

    try:
        verified = verify_registration(
            credential=msg["credential"],
            challenge=pending.challenge,
            relying_party=relying_party,
        )
    except CeremonyError:
        connection.send_error(
            msg["id"], websocket_api.ERR_INVALID_FORMAT, "Passkey registration failed"
        )
        return

    if (
        store.get(verified.credential_id) is not None
        or len(store.for_user(user.id)) >= MAX_PASSKEYS_PER_USER
    ):
        connection.send_error(
            msg["id"], websocket_api.ERR_INVALID_FORMAT, "Passkey registration failed"
        )
        return

    credential = PasskeyCredential(
        id=verified.credential_id,
        user_id=user.id,
        public_key=verified.public_key,
        sign_count=verified.sign_count,
        transports=verified.transports,
        name=name,
        created=dt_util.utcnow().isoformat(),
        rp_id=relying_party.rp_id,
    )
    await store.async_add(credential)
    connection.send_result(msg["id"], credential.as_public_dict())
