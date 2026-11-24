"""Safety cutoff: cut power on a leak or sustained high load and stay cut."""

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import (
    CONF_CUT_ON_POWER,
    CONF_LEAKS,
    CONF_NOTIFY,
    CONF_POWER_LIMIT,
    CONF_POWER_SECONDS,
    CONF_POWER_SENSOR,
    CONF_SWITCHES,
    DEFAULT_POWER_LIMIT,
    DEFAULT_POWER_SECONDS,
)
from .controller import SafetyCutoffController, SafetyCutoffSettings

PLATFORMS = [
    Platform.BINARY_SENSOR,
    Platform.BUTTON,
    Platform.SENSOR,
    Platform.SWITCH,
]

type SafetyCutoffConfigEntry = ConfigEntry[SafetyCutoffController]


async def async_setup_entry(
    hass: HomeAssistant, entry: SafetyCutoffConfigEntry
) -> None:
    """Set up a safety cutoff from a config entry."""
    options = entry.options
    controller = SafetyCutoffController(
        hass,
        entry.entry_id,
        SafetyCutoffSettings(
            name=entry.title,
            leaks=list(options[CONF_LEAKS]),
            switches=list(options[CONF_SWITCHES]),
            power_sensor=options.get(CONF_POWER_SENSOR),
            power_limit=float(options.get(CONF_POWER_LIMIT, DEFAULT_POWER_LIMIT)),
            power_seconds=float(options.get(CONF_POWER_SECONDS, DEFAULT_POWER_SECONDS)),
            cut_on_power=bool(options.get(CONF_CUT_ON_POWER, True)),
            notify=list(options.get(CONF_NOTIFY, [])),
        ),
    )
    entry.runtime_data = controller
    # Entities restore the latch and the armed switch before the first run.
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    controller.async_start()
    entry.async_on_unload(controller.async_stop)


async def async_unload_entry(
    hass: HomeAssistant, entry: SafetyCutoffConfigEntry
) -> None:
    """Unload a config entry."""
    await hass.config_entries.async_unload_platforms_or_raise(entry, PLATFORMS)
