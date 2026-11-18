"""Types shared by the defender integrations."""

from homeassistant.config_entries import ConfigEntry

from .coordinator import DefenderCoordinator

type DefenderConfigEntry = ConfigEntry[DefenderCoordinator]
