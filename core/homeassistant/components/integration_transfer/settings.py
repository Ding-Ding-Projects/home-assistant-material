"""Export and import the settings of one config entry.

A plain export holds the entry's options and its data with every sign-in left
out. An export with sign-ins is always locked with the owner's password: the
settings are sealed with the same primitives the container registry storage
uses (a random key wrapped by an Argon2id key from the password, content
sealed with AES-256-GCM). The password is used for that one call and is never
stored or logged.

An import only ever changes the existing entry it was asked to change, and
only when the file names that entry's integration. It never creates an entry.
"""

import base64
from dataclasses import dataclass
import json
from typing import Any

from homeassistant.components.registry_storage.crypto import (
    new_vault_key,
    open_bytes,
    seal_bytes,
    unwrap_vault_key,
    wrap_vault_key,
)
from homeassistant.components.registry_storage.errors import LockError, Reason
from homeassistant.components.registry_storage.passwords import require_password
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import __version__ as HA_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .const import FILE_FORMAT, MAX_FILE_BYTES, SETTINGS_KIND
from .signins import (
    async_diagnostics_redact_names,
    is_signin_key,
    keep_signins,
    strip_signins,
)


class TransferError(Exception):
    """A refusal with a short, stable code. Never carries a setting's value."""

    def __init__(self, code: str) -> None:
        """Keep only the code."""
        super().__init__(code)
        self.code = code


def _entry_header(entry: ConfigEntry) -> dict[str, Any]:
    return {
        "kind": SETTINGS_KIND,
        "format": FILE_FORMAT,
        "domain": entry.domain,
        "entry_version": entry.version,
        "entry_minor_version": entry.minor_version,
        "build": HA_VERSION,
        "made_at": dt_util.now().isoformat(timespec="seconds"),
    }


async def async_export_plain(hass: HomeAssistant, entry: ConfigEntry) -> dict[str, Any]:
    """Return the settings file without sign-ins and the names left out."""
    extra = await async_diagnostics_redact_names(hass, entry.domain)
    options, options_left_out = strip_signins(dict(entry.options), extra)
    data, data_left_out = strip_signins(dict(entry.data), extra)
    left_out = sorted({*options_left_out, *data_left_out})
    return {
        **_entry_header(entry),
        "signins_included": False,
        "left_out": left_out,
        "options": options,
        "data": data,
    }


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _unb64(text: Any) -> bytes:
    if not isinstance(text, str):
        raise TransferError("wrong_shape")
    try:
        return base64.b64decode(text.encode("ascii"), validate=True)
    except ValueError, UnicodeEncodeError:
        raise TransferError("wrong_shape") from None


def lock_settings(
    header: dict[str, Any], payload: dict[str, Any], password: str, confirmation: str
) -> dict[str, Any]:
    """Seal the full settings with the password. Slow on purpose; run in an executor."""
    require_password(password, confirmation)
    vault_key = new_vault_key()
    lock = wrap_vault_key(vault_key, password)
    plain = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    sealed_header, parts = seal_bytes(vault_key, plain)
    return {
        **header,
        "signins_included": True,
        "locked": True,
        "lock": lock,
        "sealed_header": _b64(sealed_header),
        "sealed_parts": [_b64(part) for part in parts],
    }


def export_locked(entry: ConfigEntry, password: str, confirmation: str) -> dict[str, Any]:
    """Return the locked settings file holding everything, sign-ins included.

    Run in an executor: the key derivation is slow on purpose.
    """
    payload = {
        "domain": entry.domain,
        "data": dict(entry.data),
        "options": dict(entry.options),
    }
    return lock_settings(_entry_header(entry), payload, password, confirmation)


def _unlock(file: dict[str, Any], password: str) -> dict[str, Any]:
    """Open a locked file. Slow on purpose; run in an executor."""
    lock = file.get("lock")
    parts = file.get("sealed_parts")
    if not isinstance(lock, dict) or not isinstance(parts, list) or len(parts) > 64:
        raise TransferError("wrong_shape")
    try:
        vault_key = unwrap_vault_key(lock, password)
        plain = open_bytes(
            vault_key,
            _unb64(file.get("sealed_header")),
            [_unb64(part) for part in parts],
        )
    except LockError as err:
        raise TransferError(
            "wrong_password" if err.reason is Reason.WRONG_PASSWORD else "damaged"
        ) from None
    try:
        payload = json.loads(plain)
    except ValueError:
        raise TransferError("damaged") from None
    if not isinstance(payload, dict) or payload.get("domain") != file.get("domain"):
        raise TransferError("damaged")
    return payload


@dataclass(slots=True)
class ParsedSettings:
    """The settings a file holds, ready to compare with an entry."""

    domain: str
    options: dict[str, Any]
    data: dict[str, Any]
    signins_included: bool


def read_settings_file(
    content: str, entry: ConfigEntry, password: str | None
) -> ParsedSettings:
    """Check a settings file against an entry and return what it holds.

    Runs in an executor because opening a locked file is slow on purpose.
    """
    if len(content.encode("utf-8")) > MAX_FILE_BYTES:
        raise TransferError("too_large")
    try:
        file = json.loads(content)
    except ValueError:
        raise TransferError("not_json") from None
    if not isinstance(file, dict):
        raise TransferError("wrong_kind")
    if file.get("kind") != SETTINGS_KIND or file.get("format") != FILE_FORMAT:
        raise TransferError("wrong_kind")
    if file.get("domain") != entry.domain:
        raise TransferError("wrong_domain")
    if (
        file.get("entry_version") != entry.version
        or file.get("entry_minor_version") != entry.minor_version
    ):
        raise TransferError("wrong_version")

    locked = file.get("locked") is True
    if locked:
        if not password:
            raise TransferError("password_required")
        source = _unlock(file, password)
    else:
        source = file
    options = source.get("options")
    data = source.get("data")
    if not isinstance(options, dict) or not isinstance(data, dict):
        raise TransferError("wrong_shape")
    return ParsedSettings(
        domain=entry.domain,
        options=options,
        data=data,
        signins_included=locked,
    )


def _is_shown(value: Any, extra: set[str]) -> Any:
    """Return a value as it may be shown: plain JSON, any sign-in inside it left out."""
    return json.loads(json.dumps(strip_signins(value, extra)[0]))


def plan_changes(
    entry: ConfigEntry, parsed: ParsedSettings, extra: set[str]
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], list[str]]:
    """Return the new options and data, the changes by name and the sign-in names in the file."""
    new_options = keep_signins(parsed.options, dict(entry.options), extra)
    new_data = keep_signins(parsed.data, dict(entry.data), extra)
    changes: list[dict[str, Any]] = []
    signins_in_file = sorted(
        {*strip_signins(parsed.options, extra)[1], *strip_signins(parsed.data, extra)[1]}
    )
    for part, current, new in (
        ("option", dict(entry.options), new_options),
        ("setting", dict(entry.data), new_data),
    ):
        _diff(part, "", current, new, extra, changes)
    _kept_signins(dict(entry.options), parsed.options, "", extra, changes)
    _kept_signins(dict(entry.data), parsed.data, "", extra, changes)
    return new_options, new_data, changes, signins_in_file


def _diff(
    part: str,
    path: str,
    current: Any,
    new: Any,
    extra: set[str],
    changes: list[dict[str, Any]],
) -> None:
    """Add the differences between two values, named, with values only for non sign-ins."""
    if isinstance(current, dict) and isinstance(new, dict):
        for key in sorted({*current, *new}, key=str):
            name = f"{path}.{key}" if path else str(key)
            if is_signin_key(key, extra):
                if key in new and (key not in current or current[key] != new[key]):
                    changes.append(
                        {"part": part, "name": name, "signin": True, "change": "changed"}
                    )
                continue
            if key not in new:
                changes.append(
                    {
                        "part": part,
                        "name": name,
                        "signin": False,
                        "change": "removed",
                        "old": _is_shown(current[key], extra),
                    }
                )
            elif key not in current:
                changes.append(
                    {
                        "part": part,
                        "name": name,
                        "signin": False,
                        "change": "added",
                        "new": _is_shown(new[key], extra),
                    }
                )
            else:
                _diff(part, name, current[key], new[key], extra, changes)
        return
    if current != new:
        changes.append(
            {
                "part": part,
                "name": path,
                "signin": False,
                "change": "changed",
                "old": _is_shown(current, extra),
                "new": _is_shown(new, extra),
            }
        )


def _kept_signins(
    current: Any,
    incoming: Any,
    path: str,
    extra: set[str],
    changes: list[dict[str, Any]],
) -> None:
    """Name the sign-ins kept as they are here because the file does not carry them."""
    if not isinstance(current, dict) or not isinstance(incoming, dict):
        return
    for key, value in current.items():
        name = f"{path}.{key}" if path else str(key)
        if is_signin_key(key, extra):
            if key not in incoming:
                changes.append(
                    {"part": "kept", "name": name, "signin": True, "change": "kept"}
                )
            continue
        if key in incoming:
            _kept_signins(value, incoming[key], name, extra, changes)
