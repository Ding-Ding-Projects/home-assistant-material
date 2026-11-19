"""Coordinators for the TTC transit integration."""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, override

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import (
    LiveAlerts,
    RouteStop,
    StopPredictions,
    TTCClient,
    TTCConnectionError,
    TTCDataError,
    TTCError,
    TTCInvalidStopError,
    TTCRefusedError,
    Vehicle,
)
from .const import (
    ALERTS_INTERVAL,
    ALERTS_STALE_AFTER,
    CONF_ROUTES,
    CONF_STATIONS,
    CONF_STOPS,
    CONF_WATCH_ALERTS,
    CONF_WATCH_DEPARTURES,
    CONF_WATCH_LIFTS,
    DOMAIN,
    FEED_ALERTS,
    FEED_DEPARTURES,
    FEED_LIFTS,
    FEED_VEHICLES,
    LIFTS_INTERVAL,
    LIFTS_STALE_AFTER,
    LOGGER,
    MAX_BACKOFF,
    PREDICTIONS_INTERVAL,
    PREDICTIONS_STALE_AFTER,
    SUBWAY_LINES,
    VEHICLES_INTERVAL,
    VEHICLES_STALE_AFTER,
)

# Sent after every update of any feed, so automation triggers keep working
# when the entry reloads and new coordinators take over.
SIGNAL_FEED_UPDATED = f"{DOMAIN}_feed_updated"


type TTCConfigEntry = ConfigEntry[TTCRuntimeData]


def entry_settings(entry: ConfigEntry) -> dict[str, Any]:
    """Return the entry's settings, with options taking precedence."""
    return {**entry.data, **entry.options}


class TTCFeedCoordinator[_DataT](DataUpdateCoordinator[_DataT]):
    """Base coordinator with polite backoff and a freshness limit."""

    config_entry: TTCConfigEntry
    feed: str
    stale_after: timedelta

    def __init__(
        self,
        hass: HomeAssistant,
        entry: TTCConfigEntry,
        client: TTCClient,
        interval: timedelta,
    ) -> None:
        """Initialize the coordinator."""
        super().__init__(
            hass,
            LOGGER,
            config_entry=entry,
            name=f"{DOMAIN}_{self.feed}",
            update_interval=interval,
        )
        self.client = client
        self.base_interval = interval
        self.failures = 0
        self.last_read: datetime | None = None
        self.last_attempt: datetime | None = None
        self.last_error: str | None = None

    @property
    def is_fresh(self) -> bool:
        """Return whether the last good answer is recent enough to show."""
        return (
            self.last_read is not None
            and dt_util.utcnow() - self.last_read <= self.stale_after
        )

    @property
    def next_attempt(self) -> datetime | None:
        """Return when the feed is asked next."""
        if self.update_interval is None or self.last_attempt is None:
            return None
        return self.last_attempt + self.update_interval

    @override
    @callback
    def async_update_listeners(self) -> None:
        """Update listeners and notify automation triggers."""
        super().async_update_listeners()
        async_dispatcher_send(self.hass, SIGNAL_FEED_UPDATED, self)

    async def _async_fetch(self) -> _DataT:
        raise NotImplementedError

    @override
    async def _async_update_data(self) -> _DataT:
        """Fetch the feed, backing off after errors and refusals."""
        self.last_attempt = dt_util.utcnow()
        try:
            data = await self._async_fetch()
        except TTCRefusedError as err:
            self._back_off(err.retry_after)
            self.last_error = "refused"
            raise UpdateFailed(
                translation_domain=DOMAIN,
                translation_key="refused",
                translation_placeholders={"status": str(err.status)},
            ) from err
        except TTCDataError as err:
            self._back_off(None)
            self.last_error = "malformed"
            raise UpdateFailed(
                translation_domain=DOMAIN,
                translation_key="malformed",
                translation_placeholders={"error": str(err)},
            ) from err
        except TTCError as err:
            self._back_off(None)
            self.last_error = "unreachable"
            raise UpdateFailed(
                translation_domain=DOMAIN,
                translation_key="unreachable",
                translation_placeholders={"error": str(err)},
            ) from err
        self.failures = 0
        self.last_error = None
        self.last_read = self.last_attempt
        self.update_interval = self.base_interval
        return data

    def _back_off(self, retry_after: int | None) -> None:
        if self.failures > 0 and not self.is_fresh:
            # Repeated failures do not notify listeners, but entities must
            # still show that their figures became too old.
            self.hass.loop.call_soon(self.async_update_listeners)
        self.failures += 1
        delay = self.base_interval * (2 ** min(self.failures, 6))
        if retry_after is not None:
            delay = max(delay, timedelta(seconds=retry_after))
        self.update_interval = min(delay, MAX_BACKOFF)


class TTCAlertsCoordinator(TTCFeedCoordinator[LiveAlerts]):
    """Reads the network's service alerts."""

    feed = FEED_ALERTS
    stale_after = ALERTS_STALE_AFTER

    def __init__(
        self, hass: HomeAssistant, entry: TTCConfigEntry, client: TTCClient
    ) -> None:
        """Initialize the coordinator."""
        super().__init__(hass, entry, client, ALERTS_INTERVAL)

    @override
    async def _async_fetch(self) -> LiveAlerts:
        return await self.client.async_get_live_alerts(max_age=ALERTS_INTERVAL / 2)


class TTCLiftsCoordinator(TTCFeedCoordinator[LiveAlerts]):
    """Reads elevator and escalator outages, reusing a recent alerts answer."""

    feed = FEED_LIFTS
    stale_after = LIFTS_STALE_AFTER

    def __init__(
        self, hass: HomeAssistant, entry: TTCConfigEntry, client: TTCClient
    ) -> None:
        """Initialize the coordinator."""
        super().__init__(hass, entry, client, LIFTS_INTERVAL)

    @override
    async def _async_fetch(self) -> LiveAlerts:
        return await self.client.async_get_live_alerts(max_age=ALERTS_INTERVAL)


class TTCPredictionsCoordinator(TTCFeedCoordinator[dict[str, StopPredictions]]):
    """Reads predicted departures for the chosen stops only."""

    feed = FEED_DEPARTURES
    stale_after = PREDICTIONS_STALE_AFTER

    def __init__(
        self,
        hass: HomeAssistant,
        entry: TTCConfigEntry,
        client: TTCClient,
        stops: list[str],
    ) -> None:
        """Initialize the coordinator."""
        super().__init__(hass, entry, client, PREDICTIONS_INTERVAL)
        self.stops = stops

    @override
    async def _async_fetch(self) -> dict[str, StopPredictions]:
        previous = self.data or {}
        result: dict[str, StopPredictions] = {}
        errors: list[TTCError] = []
        for stop in self.stops:
            try:
                result[stop] = await self.client.async_get_predictions(stop)
            except TTCRefusedError:
                raise
            except TTCInvalidStopError:
                LOGGER.warning("Stop %s is not known to the predictions service", stop)
            except (TTCConnectionError, TTCDataError) as err:
                errors.append(err)
                if stop in previous:
                    result[stop] = previous[stop]
        if errors and len(errors) == len(self.stops):
            raise errors[0]
        return result

    def stop_is_fresh(self, stop: str) -> bool:
        """Return whether a stop's own predictions are recent enough to show."""
        if not self.data or stop not in self.data:
            return False
        return dt_util.utcnow() - self.data[stop].read_at <= self.stale_after


@dataclass(frozen=True, slots=True)
class VehiclePositions:
    """Vehicle positions of the routes serving the chosen stops."""

    read_at: datetime
    vehicles: tuple[Vehicle, ...]
    stops: dict[str, RouteStop]


class TTCVehiclesCoordinator(TTCFeedCoordinator[VehiclePositions]):
    """Reads vehicle positions, only while a page or card is showing them.

    No entity listens to this coordinator, so it polls only while a websocket
    subscription holds a listener, and stops as soon as the last one leaves.
    """

    feed = FEED_VEHICLES
    stale_after = VEHICLES_STALE_AFTER

    def __init__(
        self,
        hass: HomeAssistant,
        entry: TTCConfigEntry,
        client: TTCClient,
        stops: list[str],
        predictions: TTCPredictionsCoordinator,
    ) -> None:
        """Initialize the coordinator."""
        super().__init__(hass, entry, client, VEHICLES_INTERVAL)
        self.stops = stops
        self.predictions = predictions
        self._places: dict[str, RouteStop] = {}
        self._routes_with_places: set[str] = set()

    def routes(self) -> list[str]:
        """Return the surface routes predicted at the chosen stops."""
        found = {
            item.route
            for stop in (self.predictions.data or {}).values()
            for item in stop.predictions
        }
        return sorted(route for route in found if route not in SUBWAY_LINES)

    @override
    async def _async_fetch(self) -> VehiclePositions:
        vehicles: list[Vehicle] = []
        for route in self.routes():
            if route not in self._routes_with_places:
                # Stop positions change rarely; read them once per route.
                self._routes_with_places.add(route)
                for place in await self.client.async_get_route_stops(route):
                    if place.stop in self.stops:
                        self._places[place.stop] = place
            vehicles.extend(await self.client.async_get_vehicles(route))
        return VehiclePositions(
            read_at=dt_util.utcnow(),
            vehicles=tuple(vehicles),
            stops=dict(self._places),
        )


@dataclass
class TTCRuntimeData:
    """Runtime data of a TTC config entry."""

    client: TTCClient
    routes: list[str]
    stations: list[str]
    stops: list[str]
    route_titles: dict[str, str] = field(default_factory=dict)
    alerts: TTCAlertsCoordinator | None = None
    lifts: TTCLiftsCoordinator | None = None
    predictions: TTCPredictionsCoordinator | None = None
    # Kept out of `coordinators`: entities must never keep it polling.
    vehicles: TTCVehiclesCoordinator | None = None

    @property
    def coordinators(self) -> list[TTCFeedCoordinator[Any]]:
        """Return the active coordinators."""
        return [
            coordinator
            for coordinator in (self.alerts, self.lifts, self.predictions)
            if coordinator is not None
        ]


@callback
def async_get_entry(hass: HomeAssistant) -> TTCConfigEntry | None:
    """Return the loaded TTC transit entry, if any."""
    entries: list[TTCConfigEntry] = hass.config_entries.async_loaded_entries(DOMAIN)
    return entries[0] if entries else None


def build_runtime_data(
    hass: HomeAssistant, entry: TTCConfigEntry, client: TTCClient
) -> TTCRuntimeData:
    """Create the coordinators for what the entry watches."""
    settings = entry_settings(entry)
    routes = list(settings.get(CONF_ROUTES, []))
    stations = list(settings.get(CONF_STATIONS, []))
    stops = list(settings.get(CONF_STOPS, []))
    data = TTCRuntimeData(client=client, routes=routes, stations=stations, stops=stops)
    if settings.get(CONF_WATCH_ALERTS):
        data.alerts = TTCAlertsCoordinator(hass, entry, client)
    if settings.get(CONF_WATCH_LIFTS) and stations:
        data.lifts = TTCLiftsCoordinator(hass, entry, client)
    if settings.get(CONF_WATCH_DEPARTURES) and stops:
        data.predictions = TTCPredictionsCoordinator(hass, entry, client, stops)
        data.vehicles = TTCVehiclesCoordinator(
            hass, entry, client, stops, data.predictions
        )
    return data
