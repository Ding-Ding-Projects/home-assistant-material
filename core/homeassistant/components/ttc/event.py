"""Event entity for new TTC alerts."""

from typing import override

from homeassistant.components.event import EventEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import ALERT_KINDS
from .coordinator import TTCAlertsCoordinator, TTCConfigEntry
from .entity import TTCEntity, network_device

PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TTCConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the new alert event entity."""
    if (alerts := entry.runtime_data.alerts) is not None:
        async_add_entities([TTCNewAlertEvent(alerts, entry)])


class TTCNewAlertEvent(TTCEntity[TTCAlertsCoordinator], EventEntity):
    """Fires once for each alert that was not there before."""

    _attr_event_types = ALERT_KINDS

    def __init__(
        self, coordinator: TTCAlertsCoordinator, entry: TTCConfigEntry
    ) -> None:
        """Initialize the event entity."""
        super().__init__(coordinator, network_device(entry), "new_alert", "network")
        self._seen: set[str] = {alert.alert_id for alert in coordinator.data.current}

    @callback
    @override
    def _handle_coordinator_update(self) -> None:
        """Fire for every alert that is new since the last answer."""
        if not self.coordinator.last_update_success:
            super()._handle_coordinator_update()
            return
        current = self.coordinator.data.current
        for alert in current:
            if alert.alert_id not in self._seen:
                self._trigger_event(alert.kind, alert.as_dict())
        self._seen = {alert.alert_id for alert in current}
        super()._handle_coordinator_update()
