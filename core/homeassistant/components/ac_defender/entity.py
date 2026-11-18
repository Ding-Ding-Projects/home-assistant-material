"""Shared entity base and the entity classes both defenders use."""

from datetime import datetime
from typing import Any

from homeassistant.components.button import ButtonEntity
from homeassistant.components.event import EventEntity
from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.components.select import SelectEntity
from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.components.switch import SwitchEntity
from homeassistant.const import UnitOfTemperature, UnitOfTime
from homeassistant.core import callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import Entity, EntityCategory

from .const import (
    EXTRA_EVENT_TYPES,
    HANDOVER_EVENT_TYPES,
    HARD_FLOOR,
    HEAT_MODE_CAP,
    HEAT_MODE_OFF,
    STATES,
)
from .coordinator import (
    SIGNAL_GUARD_ACTED,
    SIGNAL_HANDOVER,
    DefenderCoordinator,
    _number,
)


class DefenderEntity(Entity):
    """Base of every entity: one device per config entry, updated by dispatcher."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, coordinator: DefenderCoordinator, key: str) -> None:
        """Set up the entity."""
        self.coordinator = coordinator
        entry = coordinator.entry
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_translation_key = key
        cool = coordinator.run_mode == "cool"
        page = "ac-defender" if cool else "heat-defender"
        self._attr_device_info = DeviceInfo(
            identifiers={(entry.domain, entry.entry_id)},
            name=entry.title,
            manufacturer="Home Assistant",
            model="AC Defender" if cool else "Heat Defender",
            configuration_url=f"homeassistant://config/{page}?entry={entry.entry_id}",
        )

    async def async_added_to_hass(self) -> None:
        """Listen for updates."""
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, self.coordinator.signal, self._handle_update
            )
        )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()


class GuardSwitch(DefenderEntity, SwitchEntity):
    """One switch per guard."""

    def __init__(self, coordinator: DefenderCoordinator, guard_key: str) -> None:
        """Set up the switch."""
        super().__init__(coordinator, f"guard_{guard_key}")
        self.guard_key = guard_key
        spec = next(g.spec for g in coordinator.guards if g.spec.key == guard_key)
        self._spec = spec
        self._attr_translation_key = "guard"
        self._attr_translation_placeholders = {
            "guard": guard_key.replace("_", " ").capitalize()
        }
        self._attr_entity_category = EntityCategory.CONFIG

    @property
    def is_on(self) -> bool:
        """Return True when the guard is on."""
        return self.coordinator.enabled.get(self.guard_key, False)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return when the guard last acted and why."""
        acted = self.coordinator.last_acted.get(self.guard_key)
        return {
            "guard": self.guard_key,
            "safety": self._spec.safety,
            "group": self._spec.group,
            "last_acted": acted["time"].isoformat() if acted else None,
            "reason": acted["reason"] if acted else None,
        }

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Switch the guard on."""
        self.coordinator.set_guard_enabled(self.guard_key, True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Switch the guard off."""
        self.coordinator.set_guard_enabled(self.guard_key, False)


class GuardActedEvent(DefenderEntity, EventEntity):
    """Fires when any guard acts; the event type is the guard id."""

    def __init__(self, coordinator: DefenderCoordinator) -> None:
        """Set up the event entity."""
        super().__init__(coordinator, "guard_acted")
        self._attr_event_types = [
            *(g.spec.key for g in coordinator.guards),
            *EXTRA_EVENT_TYPES,
        ]

    async def async_added_to_hass(self) -> None:
        """Listen for guard actions."""
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_GUARD_ACTED.format(self.coordinator.entry.entry_id),
                self._handle_acted,
            )
        )

    @callback
    def _handle_acted(self, guard: str, reason: str) -> None:
        self._trigger_event(guard, {"reason": reason})
        self.async_write_ha_state()


class HandoverEvent(DefenderEntity, EventEntity):
    """Fires when the brother and sister hand the room to each other."""

    _attr_event_types = HANDOVER_EVENT_TYPES

    def __init__(self, coordinator: DefenderCoordinator) -> None:
        """Set up the event entity."""
        super().__init__(coordinator, "handover")

    async def async_added_to_hass(self) -> None:
        """Listen for handovers."""
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_HANDOVER.format(self.coordinator.entry.entry_id),
                self._handle_handover,
            )
        )

    @callback
    def _handle_handover(self, kind: str, data: dict[str, Any]) -> None:
        self._trigger_event(kind, data)
        self.async_write_ha_state()


class MyTemperatureNumber(DefenderEntity, NumberEntity):
    """The temperature to hold (the cap for the heat defender)."""

    _attr_mode = NumberMode.BOX
    _attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS

    def __init__(self, coordinator: DefenderCoordinator) -> None:
        """Set up the number."""
        super().__init__(
            coordinator,
            "my_temperature" if coordinator.run_mode == "cool" else "heat_cap",
        )

    def _limits(self) -> tuple[float, float, float]:
        state = self.hass.states.get(self.coordinator.climate_id)
        low = _number(state, "min_temp") or 7.0
        high = _number(state, "max_temp") or 35.0
        step = _number(state, "target_temp_step") or 0.5
        if self.coordinator.run_mode == "heat":
            low = max(low, HARD_FLOOR)
        return low, high, step

    @property
    def native_min_value(self) -> float:
        """Return the lowest allowed value."""
        return self._limits()[0]

    @property
    def native_max_value(self) -> float:
        """Return the highest allowed value."""
        return self._limits()[1]

    @property
    def native_step(self) -> float:
        """Return the device step."""
        return self._limits()[2]

    @property
    def native_value(self) -> float:
        """Return the held temperature."""
        return self.coordinator.my_temp

    async def async_set_native_value(self, value: float) -> None:
        """Store the value after the device limits and the shared band are checked."""
        try:
            self.coordinator.validate_temperature(value)
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err
        self.coordinator.set_my_temperature(value)


class StateSensor(DefenderEntity, SensorEntity):
    """What the defender is doing and why, plus the pause and stop services."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = STATES

    def __init__(self, coordinator: DefenderCoordinator) -> None:
        """Set up the sensor."""
        super().__init__(coordinator, "state")

    @property
    def native_value(self) -> str:
        """Return the state word."""
        return self.coordinator.decision.state

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the plain reason."""
        decision = self.coordinator.decision
        return {"reason": decision.reason, "guard": decision.guard}

    async def _with_sibling(
        self, also_sibling: bool, action: str, *args: float
    ) -> None:
        targets = [self.coordinator]
        if also_sibling and (other := self.coordinator.sibling()):
            targets.append(other)
        for target in targets:
            getattr(target, action)(*args)
            await target.async_evaluate()

    async def async_pause(self, hours: float, also_sibling: bool = False) -> None:
        """Pause for a number of hours; the sibling can follow."""
        await self._with_sibling(also_sibling, "start_pause", hours)

    async def async_stop_everything(self, also_sibling: bool = False) -> None:
        """Stop everything; the sibling can follow."""
        await self._with_sibling(also_sibling, "stop_everything")

    async def async_defend_again(self, also_sibling: bool = False) -> None:
        """Defend again; the sibling can follow."""
        await self._with_sibling(also_sibling, "defend_again")

    async def async_let_it_heat(self, hours: float, also_sibling: bool = False) -> None:
        """Let the heating run for a number of hours (the sister's pause)."""
        await self.async_pause(hours, also_sibling)


class NextCheckSensor(DefenderEntity, SensorEntity):
    """When the defender will look again."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, coordinator: DefenderCoordinator) -> None:
        """Set up the sensor."""
        super().__init__(coordinator, "next_check")

    @property
    def native_value(self) -> datetime | None:
        """Return the next check time."""
        return self.coordinator.decision.next_check


class HolderSensor(DefenderEntity, SensorEntity):
    """Who holds the room: brother, sister, neither or safety."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = ["ac", "heat", "neither", "safety"]

    def __init__(self, coordinator: DefenderCoordinator) -> None:
        """Set up the sensor."""
        super().__init__(coordinator, "holder")

    @property
    def native_value(self) -> str:
        """Return the holder."""
        holder = self.coordinator.arbiter.holder if self.coordinator.arbiter else ""
        return "safety" if holder.startswith("safety") else (holder or "neither")


class RunTimeSensor(DefenderEntity, SensorEntity):
    """Time spent cooling or heating, today or this month."""

    _attr_device_class = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement = UnitOfTime.HOURS
    _attr_state_class = SensorStateClass.TOTAL
    _attr_suggested_display_precision = 1

    def __init__(self, coordinator: DefenderCoordinator, month: bool) -> None:
        """Set up the sensor."""
        super().__init__(coordinator, "run_time_month" if month else "run_time_today")
        self._month = month

    @property
    def native_value(self) -> float:
        """Return hours."""
        cost = self.coordinator.cost
        return round(
            (cost.seconds_month if self._month else cost.seconds_today) / 3600, 2
        )


class CostSensor(DefenderEntity, SensorEntity):
    """Estimated cost; only exists when the owner supplied a power figure."""

    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_suggested_display_precision = 2

    def __init__(self, coordinator: DefenderCoordinator, month: bool) -> None:
        """Set up the sensor."""
        super().__init__(coordinator, "cost_month" if month else "cost_today")
        self._month = month

    @property
    def native_unit_of_measurement(self) -> str:
        """Return the currency of the instance."""
        return self.hass.config.currency

    @property
    def native_value(self) -> float | None:
        """Return the estimate."""
        return self.coordinator.cost.estimate(month=self._month)


class ActionButton(DefenderEntity, ButtonEntity):
    """Stop everything, or defend again."""

    def __init__(self, coordinator: DefenderCoordinator, key: str) -> None:
        """Set up the button."""
        super().__init__(coordinator, key)
        self._key = key

    async def async_press(self) -> None:
        """Run the action."""
        if self._key == "stop_everything":
            self.coordinator.stop_everything()
        else:
            self.coordinator.defend_again()
        await self.coordinator.async_evaluate()


class FloorNumber(DefenderEntity, NumberEntity):
    """The floor of the Heat Defender: never below the hard minimum."""

    _attr_mode = NumberMode.BOX
    _attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS
    _attr_native_min_value = HARD_FLOOR
    _attr_native_max_value = 24.0
    _attr_native_step = 0.5

    def __init__(self, coordinator: DefenderCoordinator) -> None:
        """Set up the number."""
        super().__init__(coordinator, "floor")

    @property
    def native_value(self) -> float | None:
        """Return the floor."""
        return self.coordinator.floor

    async def async_set_native_value(self, value: float) -> None:
        """Store the floor; the coordinator clamps and validates it again."""
        try:
            self.coordinator.set_floor(value)
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err


class HeatModeSelect(DefenderEntity, SelectEntity):
    """Keep the heating off, or allow it up to a cap."""

    _attr_options = [HEAT_MODE_OFF, HEAT_MODE_CAP]

    def __init__(self, coordinator: DefenderCoordinator) -> None:
        """Set up the select."""
        super().__init__(coordinator, "heat_mode")

    @property
    def current_option(self) -> str:
        """Return the mode."""
        return self.coordinator.heat_mode

    async def async_select_option(self, option: str) -> None:
        """Store the mode."""
        self.coordinator.set_heat_mode(option)
