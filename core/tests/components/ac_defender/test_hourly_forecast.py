"""Exercise the weather service input to the cool-outdoor guard."""

import asyncio
from datetime import UTC, datetime, timedelta
from tempfile import TemporaryDirectory
from types import MappingProxyType
from unittest import IsolatedAsyncioTestCase

import pytest

from homeassistant.components.ac_defender.const import (
    CONF_CLIMATE,
    CONF_GUARDS,
    CONF_OUTDOOR,
)
from homeassistant.components.ac_defender.coordinator import DefenderCoordinator
from homeassistant.components.ac_defender.pipeline import decide
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import ServiceNotFound


class TestHourlyForecast(IsolatedAsyncioTestCase):
    """Use a real service registry with a synthetic weather provider."""

    async def asyncSetUp(self) -> None:
        """Start a synthetic hourly weather source and a temporary climate unit."""
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.hass = HomeAssistant(directory.name)
        self.now = datetime.now(UTC)
        self.source = "weather.test_outdoors"
        self.calls = 0
        self.hourly_requested = asyncio.Event()
        self.rows = [
            {
                "datetime": (self.now + timedelta(minutes=30, hours=h)).isoformat(),
                "temperature": t,
            }
            for h, t in enumerate((57.2, 62.6, 60.8, 59.0))
        ]

        async def hourly(call: ServiceCall) -> dict:
            self.calls += 1
            self.hourly_requested.set()
            assert call.data["type"] == "hourly"
            assert call.data["entity_id"] == self.source
            return {self.source: {"forecast": self.rows}}

        self.hass.services.async_register(
            "weather", "get_forecasts", hourly, supports_response=SupportsResponse.ONLY
        )
        self.hass.states.async_set(
            self.source,
            "sunny",
            {"temperature": 59.0, "temperature_unit": "°F", "supported_features": 2},
        )
        self.hass.states.async_set(
            "climate.test_unit",
            "cool",
            {"current_temperature": 22, "temperature": 23, "hvac_action": "cooling"},
        )
        entry = ConfigEntry(
            version=1,
            minor_version=1,
            domain="ac_defender",
            title="Forecast test",
            data={CONF_CLIMATE: "climate.test_unit", CONF_OUTDOOR: self.source},
            source="user",
            options={CONF_GUARDS: {"cool_outdoor_shutdown": {"enabled": True}}},
            unique_id=None,
            discovery_keys=MappingProxyType({}),
            subentries_data=[],
        )
        self.coordinator = DefenderCoordinator(self.hass, entry)
        self.addCleanup(self.coordinator.async_stop)

    async def _refresh(self) -> None:
        forecast = self.coordinator._forecast
        forecast.refresh(self.source, self.now)
        forecast.refresh(self.source, self.now)
        assert forecast._pending is not None
        await asyncio.wait_for(forecast._pending, timeout=5)
        assert self.calls == 1

    async def test_actual_forecast_reaches_decision_and_unsent_off_repeats(
        self,
    ) -> None:
        """Convert provider units and retain the decision until it is sent."""
        await self._refresh()
        ctx = self.coordinator.build_ctx(self.now)
        assert ctx.outdoor == pytest.approx(15.0)
        assert ctx.forecast_peak == pytest.approx(17.0)
        assert decide(ctx, self.coordinator.guards).action == "turn_off"
        # No command was sent. The next evaluation must still request it.
        later = self.coordinator.build_ctx(self.now + timedelta(seconds=30))
        assert decide(later, self.coordinator.guards).action == "turn_off"
        self.coordinator._forecast.refresh(self.source, self.now + timedelta(minutes=1))
        assert self.coordinator._forecast._pending is None

    async def test_incomplete_or_expired_window_remains_unknown(self) -> None:
        """A gap or an expired forecast cannot authorize an outdoor shutdown."""
        self.rows.pop(1)
        self.rows.append({"datetime": self.now.isoformat(), "temperature": "nan"})
        await self._refresh()
        assert self.coordinator.build_ctx(self.now).forecast_peak is None
        assert self.coordinator._forecast.peak(self.now + timedelta(days=1), 1) is None

    async def test_coordinator_refreshes_and_retries_when_the_service_returns(
        self,
    ) -> None:
        """Send through the real service registry after a previously unsent action."""
        calls = []
        sent = asyncio.Event()

        async def set_mode(call: ServiceCall) -> None:
            calls.append(call.data["hvac_mode"])
            sent.set()

        await self.coordinator.async_evaluate()
        await asyncio.wait_for(self.hourly_requested.wait(), timeout=3)
        if pending := self.coordinator._forecast._pending:
            await asyncio.wait_for(pending, timeout=5)
        # The weather is ready while the actuator service is still unavailable.
        with pytest.raises(ServiceNotFound):
            await self.coordinator.async_evaluate()
        assert self.coordinator.off_command_at is None

        self.hass.services.async_register("climate", "set_hvac_mode", set_mode)
        decision = await self.coordinator.async_evaluate()
        await asyncio.wait_for(sent.wait(), timeout=5)
        assert decision.action == "turn_off"
        assert calls == ["off"]
        assert self.coordinator.off_command_at is not None
        assert self.calls == 1

    async def test_a_warm_hour_blocks_forecast_based_shutdown(self) -> None:
        """One warm hour prevents a shutdown despite a cold outdoor reading."""
        self.rows[2]["temperature"] = 80.6
        await self._refresh()
        ctx = self.coordinator.build_ctx(self.now)
        assert ctx.forecast_peak == pytest.approx(27.0)
        assert decide(ctx, self.coordinator.guards).action != "turn_off"

    async def test_source_loss_discards_previous_weather_data(self) -> None:
        """Drop cached values as soon as the linked provider stops being available."""
        await self._refresh()
        self.hass.states.async_set(self.source, "unavailable")
        self.coordinator._forecast.refresh(self.source, self.now)
        assert self.coordinator.build_ctx(self.now).forecast_peak is None
        assert self.calls == 1

    async def test_unsent_shutdown_rechecks_new_weather_before_retry(self) -> None:
        """Do not send an old shutdown after the forecast ceases to justify it."""
        await self._refresh()
        first = self.coordinator.build_ctx(self.now)
        assert decide(first, self.coordinator.guards).action == "turn_off"
        self.rows[0]["temperature"] = 80.6
        later = self.now + timedelta(minutes=16)
        self.coordinator._forecast.refresh(self.source, later)
        await asyncio.wait_for(self.coordinator._forecast._pending, timeout=5)
        changed = self.coordinator.build_ctx(later)
        assert changed.forecast_peak == pytest.approx(27)
        assert decide(changed, self.coordinator.guards).action != "turn_off"
        assert not self.coordinator.guard_state["cool_outdoor_shutdown"].get("off")
