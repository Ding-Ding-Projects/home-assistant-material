"""Hourly outdoor forecasts used by the cool-outdoor decision."""

import asyncio
from datetime import datetime, timedelta
import math
from typing import Any

from homeassistant.components.weather.const import (
    ATTR_FORECAST_TEMP,
    ATTR_FORECAST_TIME,
    ATTR_WEATHER_TEMPERATURE_UNIT,
    DOMAIN as WEATHER_DOMAIN,
    SERVICE_GET_FORECASTS,
    WeatherEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    ATTR_ENTITY_ID,
    ATTR_SUPPORTED_FEATURES,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
    UnitOfTemperature,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util.unit_conversion import TemperatureConverter

REFRESH_INTERVAL = timedelta(minutes=15)


def celsius(value: Any, unit: str | None) -> float | None:
    """Return a finite reading in the units of the outdoor thresholds."""
    if isinstance(value, bool) or unit not in UnitOfTemperature:
        return None
    try:
        number = float(value)
    except TypeError, ValueError, OverflowError:
        return None
    if not math.isfinite(number):
        return None
    return TemperatureConverter.convert(number, unit, UnitOfTemperature.CELSIUS)


class OutdoorForecast:
    """Refresh only the selected weather entity, outside the control loop."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Keep the provider, cached readings and task owned by this entry."""
        self._hass = hass
        self._entry = entry
        self._source: tuple[str, str] | None = None
        self._next_refresh: datetime | None = None
        self._pending: asyncio.Task[None] | None = None
        self._readings: list[tuple[datetime, float]] = []

    def clear(self) -> None:
        """Forget previous data and cancel the request owned by this entry."""
        if self._pending is not None:
            self._pending.cancel()
            self._pending = None
        self._source = None
        self._next_refresh = None
        self._readings = []

    def refresh(self, entity_id: str | None, now: datetime) -> None:
        """Arrange a bounded refresh for an available hourly provider."""
        state = self._hass.states.get(entity_id) if entity_id else None
        source = None
        if (
            state is not None
            and state.domain == WEATHER_DOMAIN
            and state.state not in (STATE_UNKNOWN, STATE_UNAVAILABLE)
            and isinstance(
                features := state.attributes.get(ATTR_SUPPORTED_FEATURES), int
            )
            and features & WeatherEntityFeature.FORECAST_HOURLY
            and (unit := state.attributes.get(ATTR_WEATHER_TEMPERATURE_UNIT))
            in UnitOfTemperature
            and self._hass.services.has_service(WEATHER_DOMAIN, SERVICE_GET_FORECASTS)
        ):
            source = (state.entity_id, unit)
        if source != self._source:
            self.clear()
            self._source = source
        if source is None or self._pending is not None:
            return
        if self._next_refresh is not None and now < self._next_refresh:
            return
        self._next_refresh = now + REFRESH_INTERVAL
        self._readings = []
        self._pending = self._entry.async_create_background_task(
            self._hass,
            self._fetch(*source),
            "ac_defender hourly forecast",
            eager_start=False,
        )

    async def _fetch(self, entity_id: str, unit: str) -> None:
        """Accept only the response to the current provider request."""
        try:
            async with asyncio.timeout(20):
                response = await self._hass.services.async_call(
                    WEATHER_DOMAIN,
                    SERVICE_GET_FORECASTS,
                    {ATTR_ENTITY_ID: entity_id, "type": "hourly"},
                    blocking=True,
                    return_response=True,
                )
            if asyncio.current_task() is not self._pending or not response:
                return
            forecast = response.get(entity_id)
            if not isinstance(forecast, dict) or not isinstance(
                forecast.get("forecast"), list
            ):
                return
            for row in forecast["forecast"]:
                if not isinstance(row, dict) or not isinstance(
                    stamp := row.get(ATTR_FORECAST_TIME), str
                ):
                    continue
                try:
                    when = datetime.fromisoformat(stamp)
                except ValueError:
                    continue
                value = celsius(row.get(ATTR_FORECAST_TEMP), unit)
                if when.tzinfo is not None and value is not None:
                    self._readings.append((when, value))
        except HomeAssistantError, TimeoutError, OSError:
            # An unavailable forecast cannot authorize a shutdown.
            pass
        finally:
            if asyncio.current_task() is self._pending:
                self._pending = None

    def peak(self, now: datetime, hours: int) -> float | None:
        """Require a genuine reading for every hour in the configured lookahead."""
        peaks: dict[int, float] = {}
        for when, value in self._readings:
            bucket = int((when - now) // timedelta(hours=1))
            if 0 <= bucket < hours:
                peaks[bucket] = max(value, peaks.get(bucket, value))
        return max(peaks.values()) if peaks and len(peaks) == hours else None
