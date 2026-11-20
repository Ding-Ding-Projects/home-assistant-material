"""Decide which settings are sign-ins and take them out of an export.

The rule is deliberately broad: a key is a sign-in when its name is one of a
fixed list, ends with one of a fixed list of suffixes, contains one of a few
telling words, or is a key the integration's own diagnostics would redact.
When a key is a sign-in, everything nested under it is a sign-in too. A false
positive only means a setting is left out of the file and kept as it is on the
importing system; a false negative would put a credential in a plain file, so
any doubt counts as a sign-in.
"""

from collections.abc import Collection, Iterable, Mapping
from types import ModuleType
from typing import Any, Final

from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

SIGNIN_NAMES: Final = frozenset(
    {
        "access_token",
        "api_key",
        "apikey",
        "auth",
        "authorization",
        "client_id",
        "client_secret",
        "cloudhook_url",
        "code",
        "cookie",
        "cookies",
        "credential",
        "credentials",
        "email",
        "key",
        "login",
        "pass",
        "passcode",
        "passphrase",
        "passwd",
        "password",
        "pin",
        "private_key",
        "refresh_token",
        "secret",
        "session",
        "token",
        "user",
        "username",
        "webhook_id",
    }
)

SIGNIN_SUFFIXES: Final = tuple(
    f"_{name}"
    for name in (
        "auth",
        "code",
        "credential",
        "credentials",
        "email",
        "id_token",
        "key",
        "login",
        "pass",
        "pin",
        "session",
        "token",
        "user",
        "username",
        "webhook_id",
        "cloudhook_url",
    )
)

SIGNIN_WORDS: Final = (
    "password",
    "passwd",
    "passphrase",
    "secret",
    "token",
    "apikey",
    "api_key",
    "credential",
    "cookie",
    "private",
    "webhook",
    "cloudhook",
)


def _normalise(key: Any) -> str:
    return str(key).strip().lower().replace("-", "_").replace(" ", "_")


def is_signin_key(key: Any, extra: Collection[str] = ()) -> bool:
    """Return whether a key names a sign-in."""
    name = _normalise(key)
    if name in SIGNIN_NAMES or name in extra:
        return True
    if name.endswith(SIGNIN_SUFFIXES):
        return True
    return any(word in name for word in SIGNIN_WORDS)


def _child_path(path: str, key: Any) -> str:
    return f"{path}.{key}" if path else str(key)


def strip_signins(
    value: Any, extra: Collection[str] = (), path: str = ""
) -> tuple[Any, list[str]]:
    """Return a copy without sign-ins and the dotted names of what was left out."""
    left_out: list[str] = []
    if isinstance(value, Mapping):
        kept: dict[str, Any] = {}
        for key, item in value.items():
            name = _child_path(path, key)
            if is_signin_key(key, extra):
                left_out.append(name)
                continue
            kept[key], nested = strip_signins(item, extra, name)
            left_out.extend(nested)
        return kept, left_out
    if isinstance(value, list | tuple):
        items: list[Any] = []
        for index, item in enumerate(value):
            stripped, nested = strip_signins(item, extra, f"{path}[{index}]")
            items.append(stripped)
            left_out.extend(nested)
        return items, left_out
    return value, left_out


def signin_names(
    value: Any, extra: Collection[str] = (), path: str = ""
) -> list[str]:
    """Return the dotted names of every sign-in in a value."""
    return strip_signins(value, extra, path)[1]


def keep_signins(incoming: Any, current: Any, extra: Collection[str] = ()) -> Any:
    """Put back the sign-ins of the current value that the incoming value lacks.

    Sign-ins the incoming value carries win; sign-ins it does not carry are
    kept as they are on this system, at every level.
    """
    if isinstance(incoming, Mapping) and isinstance(current, Mapping):
        merged: dict[str, Any] = {}
        for key, item in incoming.items():
            merged[key] = (
                keep_signins(item, current[key], extra) if key in current else item
            )
        for key, item in current.items():
            if key not in incoming and is_signin_key(key, extra):
                merged[key] = item
        return merged
    if (
        isinstance(incoming, list)
        and isinstance(current, list)
        and len(incoming) == len(current)
    ):
        return [
            keep_signins(new, old, extra)
            for new, old in zip(incoming, current, strict=True)
        ]
    return incoming


def _redact_names(module: ModuleType) -> set[str]:
    """Collect the key names a diagnostics module declares it redacts."""
    names: set[str] = set()
    for attribute, value in vars(module).items():
        if "REDACT" not in attribute.upper():
            continue
        if isinstance(value, str) or not isinstance(value, Iterable):
            continue
        try:
            items = list(value)
        except TypeError:
            continue
        names.update(_normalise(item) for item in items if isinstance(item, str))
    return names


async def async_diagnostics_redact_names(hass: HomeAssistant, domain: str) -> set[str]:
    """Return the keys the integration's diagnostics would redact, if it has any.

    Any failure to read them only means the fixed rules are used alone.
    """
    try:
        integration = await async_get_integration(hass, domain)
        module = await integration.async_get_platform("diagnostics")
    except Exception:  # noqa: BLE001
        return set()
    return _redact_names(module)
