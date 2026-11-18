"""Decide whether a backup is requested before an update installs."""

from collections.abc import Container, Iterable, Mapping
from typing import Any

KIND_CORE = "core"
KIND_SUPERVISOR = "supervisor"
KIND_OS = "os"
KIND_APP = "app"
KIND_INTEGRATION = "integration"
KIND_DEVICE = "device"

SYSTEM_KINDS = (KIND_CORE, KIND_SUPERVISOR, KIND_OS)
KINDS = (*SYSTEM_KINDS, KIND_APP, KIND_INTEGRATION, KIND_DEVICE)

CHOICE_SYSTEM = "system"
CHOICE_ALL = "all"
CHOICE_NONE = "none"
CHOICE_CUSTOM = "custom"
PRESETS = (CHOICE_SYSTEM, CHOICE_ALL, CHOICE_NONE)

_APP_SUFFIX = "_version_latest"

# A hassio unique id prefix tells the system updates apart from apps.
_HASSIO_SYSTEM_PREFIXES = {
    "home_assistant_core_": KIND_CORE,
    "home_assistant_supervisor_": KIND_SUPERVISOR,
    "home_assistant_os_": KIND_OS,
    "home_assistant_host_": KIND_OS,
}


def classify_kind(
    entity_id: str,
    system_entity_ids: Mapping[str, str],
    platform: str | None,
    unique_id: str | None,
    device_class: str | None,
    custom_platform: bool,
) -> str:
    """Return the kind of an update.

    Core, the Supervisor and the operating system are recognised by their fixed
    entity id or the unique id of the hassio integration. Other hassio updates are
    apps. An update from a custom integration (community store or another custom
    source) is an integration. Everything else, including every firmware update,
    is a device.
    """
    for part, system_entity_id in system_entity_ids.items():
        if entity_id == system_entity_id:
            return part
    if platform == "hassio":
        for prefix, kind in _HASSIO_SYSTEM_PREFIXES.items():
            if (unique_id or "").startswith(prefix):
                return kind
        return KIND_APP
    if device_class == "firmware":
        return KIND_DEVICE
    if custom_platform or platform == "hacs":
        return KIND_INTEGRATION
    return KIND_DEVICE


def preset_kinds(choice: str) -> dict[str, bool]:
    """Return the value of every kind for one of the three presets."""
    return {
        kind: choice == CHOICE_ALL or (choice == CHOICE_SYSTEM and kind in SYSTEM_KINDS)
        for kind in KINDS
    }


def preset_apps_later(choice: str) -> bool:
    """Whether apps installed later are chosen under a preset."""
    return choice == CHOICE_ALL


def app_slug(unique_id: str | None) -> str | None:
    """Return the app identifier in the unique id of a hassio app update."""
    if not unique_id or not unique_id.endswith(_APP_SUFFIX):
        return None
    return unique_id.removesuffix(_APP_SUFFIX) or None


def prune_apps(chosen: Iterable[str], installed: Iterable[str]) -> list[str]:
    """Drop chosen apps that are not installed any more, keeping the order."""
    present = set(installed)
    return [slug for slug in dict.fromkeys(chosen) if slug in present]


def choice_for(
    kinds: Mapping[str, bool],
    apps: Iterable[str] = (),
    later: bool = False,
) -> str:
    """Name the preset the stored values match, or custom."""
    chosen = list(apps)
    for choice in PRESETS:
        if preset_kinds(choice) != dict(kinds):
            continue
        if choice == CHOICE_ALL:
            return choice if later else CHOICE_CUSTOM
        if not chosen and not later:
            return choice
    return CHOICE_CUSTOM


def settings_from_store(data: Mapping[str, object]) -> dict[str, Any]:
    """Read the stored backup choice.

    Settings saved before the per-kind choice only hold one boolean: true means
    every update, false means no update. Without either, every update is kept,
    which is what the single boolean defaulted to.
    """
    old = CHOICE_ALL if data.get("backup", True) else CHOICE_NONE
    fallback = preset_kinds(old)
    stored = data.get("backup_kinds")
    kinds = (
        {
            kind: stored[kind] if isinstance(stored.get(kind), bool) else fallback[kind]
            for kind in KINDS
        }
        if isinstance(stored, dict)
        else fallback
    )
    return {
        "kinds": kinds,
        "apps": _slugs(data.get("backup_apps")),
        "seen": _slugs(data.get("backup_apps_seen")),
        "later": bool(data.get("backup_apps_later", kinds[KIND_APP])),
    }


def _slugs(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def wants_backup(
    kind: str,
    kinds: Mapping[str, bool],
    supports_backup: bool,
    slug: str | None = None,
    apps: Container[str] = (),
    seen: Container[str] = (),
    later: bool = False,
) -> bool:
    """Whether a backup is requested before an update of this kind installs.

    An app that is not covered by the whole kind follows the apps chosen one by
    one; an app that was not installed when they were chosen follows the choice
    for apps installed later.
    """
    if not supports_backup:
        return False
    if kinds.get(kind, False):
        return True
    if kind != KIND_APP or slug is None:
        return False
    return slug in apps or (slug not in seen and later)
