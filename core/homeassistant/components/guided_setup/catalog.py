"""Find the integrations that are configured in YAML and describe their options."""

from dataclasses import dataclass
import logging
import os
import re
from typing import Any

import probatio

from homeassistant.core import HomeAssistant
from homeassistant.generated.entity_platforms import EntityPlatforms
from homeassistant.loader import (
    Integration,
    IntegrationNotFound,
    async_get_integration_descriptions,
    async_get_integrations,
)
from homeassistant.requirements import (
    RequirementsNotFound,
    async_get_integration_with_requirements,
)
from homeassistant.util.hass_dict import HassKey

from .const import CONF_PLATFORM_KEY, DOCUMENTATION_URL, EXCLUDED_INTEGRATION_TYPES
from .schema_fields import (
    mapping_parts,
    count_free_form,
    describe_mapping,
    item_kinds,
    key_info,
    list_item_validator,
)

_LOGGER = logging.getLogger(__name__)

DATA_CATALOG: HassKey[list[dict[str, Any]]] = HassKey("guided_setup_catalog")

# A domain schema built with one of these helpers accepts no options of its own.
_EMPTY_SCHEMA_HELPERS = re.compile(
    r"CONFIG_SCHEMA\s*(?::[^=]+)?=\s*[^\n]*"
    r"(empty_config_schema|config_entry_only_config_schema|platform_only_config_schema)"
)

@dataclass(slots=True)
class FormDescription:
    """The form for one integration, or the reason there is none."""

    domain: str
    entity_domain: str | None
    name: str
    documentation: str
    # True when at least one option was drawn from the integration's schema.
    serializable: bool
    fields: list[dict[str, Any]]
    # Why the form is free-form, when it is.
    reason: str | None = None
    as_list: bool = False
    kinds: list[dict[str, Any]] | None = None

    def fallback_fields(self) -> int:
        """Count the options that are edited as YAML inside a drawn form."""
        total = count_free_form(self.fields)
        for kind in self.kinds or []:
            total += count_free_form(kind["fields"])
        return total

    def as_dict(self) -> dict[str, Any]:
        """Return the websocket representation."""
        return {
            "domain": self.domain,
            "entity_domain": self.entity_domain,
            "name": self.name,
            "documentation": self.documentation,
            "serializable": self.serializable,
            "fields": self.fields,
            "kinds": self.kinds,
            "as_list": self.as_list,
            "fallback_fields": self.fallback_fields(),
            "reason": self.reason,
        }


def documentation_url(integration: Integration | None, domain: str) -> str:
    """Return the documentation page of an integration."""
    if integration is not None and (
        url := integration.manifest.get("documentation")
    ):
        return str(url)
    return DOCUMENTATION_URL.format(domain=domain)


def _scan_integration(
    path: str, platforms: frozenset[str]
) -> tuple[list[str], bool]:
    """Find the YAML options of one integration by reading its source.

    This is a quick heuristic used to build the list. The schema itself is
    imported and inspected only when somebody opens the integration.
    """
    entity_domains: list[str] = []
    has_domain_schema = False
    try:
        names = set(os.listdir(path))
    except OSError:
        return entity_domains, has_domain_schema

    for platform in sorted(platforms):
        candidate = None
        if f"{platform}.py" in names:
            candidate = os.path.join(path, f"{platform}.py")
        elif platform in names and os.path.isdir(os.path.join(path, platform)):
            candidate = os.path.join(path, platform, "__init__.py")
        if candidate is None:
            continue
        try:
            with open(candidate, encoding="utf-8") as handle:
                if "PLATFORM_SCHEMA" in handle.read():
                    entity_domains.append(platform)
        except OSError:
            continue

    if "__init__.py" in names:
        try:
            with open(os.path.join(path, "__init__.py"), encoding="utf-8") as handle:
                text = handle.read()
        except OSError:
            text = ""
        has_domain_schema = "CONFIG_SCHEMA" in text and not _EMPTY_SCHEMA_HELPERS.search(
            text
        )
    return entity_domains, has_domain_schema


async def async_get_catalog(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Return the integrations that have no setup screen but accept YAML options."""
    if (cached := hass.data.get(DATA_CATALOG)) is not None:
        return cached

    descriptions = await async_get_integration_descriptions(hass)
    candidates: dict[str, dict[str, Any]] = {}
    for source in ("core", "custom"):
        for domain, meta in descriptions[source]["integration"].items():
            if meta.get("config_flow"):
                candidates.pop(domain, None)
                continue
            if meta.get("integration_type") in EXCLUDED_INTEGRATION_TYPES:
                continue
            candidates[domain] = meta

    integrations = await async_get_integrations(hass, list(candidates))
    platforms = frozenset(platform.value for platform in EntityPlatforms)

    def _scan_all() -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for domain, meta in candidates.items():
            integration = integrations.get(domain)
            if not isinstance(integration, Integration):
                continue
            if integration.config_flow:
                continue
            entity_domains, has_domain_schema = _scan_integration(
                str(integration.file_path), platforms
            )
            if not entity_domains and not has_domain_schema:
                continue
            result.append(
                {
                    "domain": domain,
                    "name": meta.get("name") or integration.name,
                    "documentation": documentation_url(integration, domain),
                    "entity_domains": entity_domains,
                    "has_domain_schema": has_domain_schema,
                    "integration_type": meta.get("integration_type"),
                    "iot_class": meta.get("iot_class"),
                    "is_built_in": integration.is_built_in,
                }
            )
        result.sort(key=lambda item: str(item["name"]).casefold())
        return result

    catalog = await hass.async_add_executor_job(_scan_all)
    hass.data[DATA_CATALOG] = catalog
    return catalog


def _humanize(name: str) -> str:
    return name.replace("_", " ").strip().capitalize()


def _label(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for item in fields:
        item.setdefault("label", _humanize(item["name"]))
        if "schema" in item:
            item["title"] = item["label"]
            _label(item["schema"])
    return fields


@dataclass(slots=True)
class Shape:
    """How the options of one integration are laid out."""

    fields: list[dict[str, Any]]
    # Set when each configuration is one item of a list in the YAML.
    as_list: bool = False
    # Set when an item is keyed by its kind; the user picks the kind first.
    kinds: list[dict[str, Any]] | None = None


def describe_schema(schema: Any, domain: str, entity_domain: str | None) -> Shape:
    """Walk a schema and describe its options.

    Raises ValueError when no option can be described at all.
    """
    if entity_domain is not None:
        fields = describe_mapping(schema)
        if fields is None:
            raise ValueError("The options are not a plain set of named options.")
        if not fields:
            raise ValueError("The schema has no options.")
        return Shape(_label(fields))

    value = None
    for keys in mapping_parts(schema):
        for key, candidate in keys.items():
            if key_info(key)[0] == domain:
                value = candidate
    if value is None:
        raise ValueError("The schema does not describe the integration's options.")

    if (fields := describe_mapping(value)) is not None:
        if not fields:
            raise ValueError("The schema has no options.")
        return Shape(_label(fields))

    item = list_item_validator(value)
    if item is None:
        raise ValueError("The options are named by you, so they cannot be listed.")
    if (kinds := item_kinds(item)) is not None:
        for kind in kinds:
            _label(kind["fields"])
        return Shape([], as_list=True, kinds=kinds)
    if (fields := describe_mapping(item)) is not None and fields:
        return Shape(_label(fields), as_list=True)
    raise ValueError("The options of each item cannot be listed.")


async def _async_get_schema(
    hass: HomeAssistant, domain: str, entity_domain: str | None
) -> tuple[Integration, Any]:
    """Import the integration and return the schema it validates against."""
    integration = await async_get_integration_with_requirements(hass, domain)
    if entity_domain is not None:
        platform = await integration.async_get_platform(entity_domain)
        return integration, getattr(platform, "PLATFORM_SCHEMA", None)
    component = await integration.async_get_component()
    return integration, getattr(component, "CONFIG_SCHEMA", None)


async def async_get_form(
    hass: HomeAssistant, domain: str, entity_domain: str | None
) -> FormDescription:
    """Describe the form for an integration, falling back to free-form YAML."""
    try:
        integration, schema = await _async_get_schema(hass, domain, entity_domain)
    except IntegrationNotFound as err:
        raise ValueError(f"The integration could not be found: {err}") from err
    except (RequirementsNotFound, ImportError) as err:
        name = _humanize(domain)
        return FormDescription(
            domain,
            entity_domain,
            name,
            documentation_url(None, domain),
            False,
            [],
            "This integration needs a Python package that is not available in "
            f"this installation, so its options cannot be listed ({err}).",
        )

    name = integration.name
    documentation = documentation_url(integration, domain)
    if schema is None:
        return FormDescription(
            domain,
            entity_domain,
            name,
            documentation,
            False,
            [],
            "The integration does not publish a schema for these options.",
        )
    try:
        shape = describe_schema(schema, domain, entity_domain)
    except ValueError as err:
        _LOGGER.debug("Schema of %s cannot be described: %s", domain, err)
        return FormDescription(
            domain,
            entity_domain,
            name,
            documentation,
            False,
            [],
            f"The options cannot be drawn as a form: {err}",
        )
    return FormDescription(
        domain,
        entity_domain,
        name,
        documentation,
        True,
        shape.fields,
        as_list=shape.as_list,
        kinds=shape.kinds,
    )


async def async_is_list(
    hass: HomeAssistant, domain: str, entity_domain: str | None
) -> bool:
    """Return True when each configuration is one item of a YAML list."""
    if entity_domain is not None:
        return False
    try:
        _, schema = await _async_get_schema(hass, domain, entity_domain)
        return schema is not None and describe_schema(schema, domain, None).as_list
    except (IntegrationNotFound, RequirementsNotFound, ImportError, ValueError):
        return False


def _collect_errors(err: probatio.Invalid) -> list[dict[str, Any]]:
    errors = getattr(err, "errors", None) or [err]
    result = []
    for item in errors:
        path = [str(part) for part in getattr(item, "path", [])]
        # The wrapping domain key or platform key is not a field the user sees.
        message = getattr(item, "error_message", None) or str(item)
        result.append({"path": path, "message": str(message)})
    return result


async def async_validate(
    hass: HomeAssistant,
    domain: str,
    entity_domain: str | None,
    data: dict[str, Any],
    as_list: bool = False,
) -> list[dict[str, Any]]:
    """Validate options against the real schema of the integration.

    Returns the list of field-level errors, empty when the options are valid.
    Option values are never logged.
    """
    try:
        _, schema = await _async_get_schema(hass, domain, entity_domain)
    except (IntegrationNotFound, RequirementsNotFound, ImportError) as err:
        return [{"path": [], "message": f"The integration could not be loaded: {err}"}]

    if schema is None:
        # Nothing to validate against; the integration decides when it loads.
        return []

    if entity_domain is not None:
        candidate: Any = {CONF_PLATFORM_KEY: domain, **data}
    else:
        candidate = {domain: [data] if as_list else data}
    try:
        schema(candidate)
    except probatio.Invalid as err:
        errors = _collect_errors(err)
        if entity_domain is None:
            # Drop the domain key that wraps the options.
            for error in errors:
                if error["path"] and error["path"][0] == domain:
                    error["path"] = error["path"][1:]
                if as_list and error["path"] and error["path"][0] == "0":
                    error["path"] = error["path"][1:]
        return errors
    return []
