"""Config flow for linked media, created by the system."""

from typing import Any

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .const import DOMAIN


class LinkedMediaConfigFlow(ConfigFlow, domain=DOMAIN):
    """Create the single linked media entry."""

    VERSION = 1

    async def async_step_system(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Create the entry when Home Assistant starts linked media."""
        return self.async_create_entry(title="Linked media", data={})
