"""The list of installed integrations and the comparison with another list.

The list names integrations, where each came from and the kinds of entity it
makes. It never reads entry data or options, unique ids, entity ids, states or
addresses. Names the owner gave (entry titles) and counts are only added when
asked for.
"""

from collections import Counter, defaultdict
from collections.abc import Iterable
import re
from typing import Any, Final

from homeassistant.config_entries import SOURCE_IGNORE, ConfigEntry
from homeassistant.const import __version__ as HA_VERSION
from homeassistant.core import HomeAssistant, split_entity_id
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.loader import Integration, async_get_integrations
from homeassistant.util import dt as dt_util

from .const import FILE_FORMAT, LIST_KIND

DOMAIN_PATTERN: Final = re.compile(r"^[a-z0-9_]{1,64}$")


def _counted_entries(hass: HomeAssistant) -> dict[str, list[ConfigEntry]]:
    """Return the entries that count as installed, by domain."""
    entries: dict[str, list[ConfigEntry]] = defaultdict(list)
    for entry in hass.config_entries.async_entries():
        if entry.source == SOURCE_IGNORE:
            continue
        entries[entry.domain].append(entry)
    return entries


def _entity_kinds(
    hass: HomeAssistant, entry_domain: dict[str, str]
) -> dict[str, Counter[str]]:
    """Count entities by entity domain for each integration domain."""
    kinds: dict[str, Counter[str]] = defaultdict(Counter)
    for entity in er.async_get(hass).entities.values():
        if (domain := entry_domain.get(entity.config_entry_id or "")) is None:
            continue
        kinds[domain][split_entity_id(entity.entity_id)[0]] += 1
    return kinds


def _device_counts(hass: HomeAssistant, entry_domain: dict[str, str]) -> Counter[str]:
    """Count devices for each integration domain."""
    counts: Counter[str] = Counter()
    for device in dr.async_get(hass).devices:
        if (domain := entry_domain.get(device.config_entry_id or "")) is not None:
            counts[domain] += 1
    return counts


def _describe(domain: str, found: Integration | Exception) -> dict[str, Any]:
    """Return the name, source and version of an integration."""
    if isinstance(found, Integration):
        built_in = found.is_built_in
        version = None if built_in or found.version is None else str(found.version)
        return {
            "name": found.name or domain,
            "source": "built_in" if built_in else "custom",
            "version": version,
        }
    return {"name": domain, "source": "custom", "version": None}


async def async_build_list(
    hass: HomeAssistant, *, titles: bool, counts: bool
) -> dict[str, Any]:
    """Return the integrations list as it is written to the file."""
    entries = _counted_entries(hass)
    found = await async_get_integrations(hass, entries)
    entry_domain = {
        entry.entry_id: domain
        for domain, domain_entries in entries.items()
        for entry in domain_entries
    }
    kinds = _entity_kinds(hass, entry_domain)
    devices = _device_counts(hass, entry_domain) if counts else Counter()

    integrations: list[dict[str, Any]] = []
    for domain in sorted(entries):
        row: dict[str, Any] = {"domain": domain, **_describe(domain, found[domain])}
        row["entries"] = len(entries[domain])
        if titles:
            row["titles"] = sorted(entry.title for entry in entries[domain])
        domain_kinds = kinds.get(domain, Counter())
        row["entity_kinds"] = sorted(domain_kinds)
        if counts:
            row["entity_counts"] = dict(sorted(domain_kinds.items()))
            row["devices"] = devices.get(domain, 0)
        integrations.append(row)

    return {
        "kind": LIST_KIND,
        "format": FILE_FORMAT,
        "build": HA_VERSION,
        "made_at": dt_util.now().isoformat(timespec="seconds"),
        "names_included": titles,
        "counts_included": counts,
        "integrations": integrations,
    }


async def async_compare(hass: HomeAssistant, domains: Iterable[str]) -> dict[str, Any]:
    """Report what this system knows about each named domain.

    A name that is not a plain domain is reported as unknown without being
    looked up, so nothing named in a file is ever used as a path.
    """
    wanted = list(dict.fromkeys(domains))
    valid = [domain for domain in wanted if DOMAIN_PATTERN.match(domain)]
    found = await async_get_integrations(hass, valid) if valid else {}
    entries = _counted_entries(hass)
    result: dict[str, Any] = {}
    for domain in wanted:
        integration = found.get(domain)
        if not isinstance(integration, Integration):
            result[domain] = {
                "known": False,
                "built_in": False,
                "config_flow": False,
                "entries": 0,
            }
            continue
        result[domain] = {
            "known": True,
            "built_in": integration.is_built_in,
            "config_flow": integration.config_flow,
            "entries": len(entries.get(domain, [])),
        }
    return {"domains": result}
