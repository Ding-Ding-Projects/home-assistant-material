"""Websocket command that feeds the TTC transit page and cards."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from .api import LiveAlerts, route_name
from .const import (
    ATTRIBUTION,
    CONF_WATCH_ALERTS,
    CONF_WATCH_DEPARTURES,
    CONF_WATCH_LIFTS,
    DOMAIN,
    KIND_ELEVATOR,
    KIND_ESCALATOR,
    SUBWAY_LINES,
)
from .coordinator import (
    TTCConfigEntry,
    TTCFeedCoordinator,
    TTCVehiclesCoordinator,
    async_get_entry,
    entry_settings,
)


@callback
def async_setup_websocket(hass: HomeAssistant) -> None:
    """Register the websocket command."""
    websocket_api.async_register_command(hass, ws_overview)
    websocket_api.async_register_command(hass, ws_subscribe_vehicles)


def vehicles_payload(coordinator: TTCVehiclesCoordinator) -> dict[str, Any]:
    """Return the vehicle positions and the chosen stops' places."""
    data = coordinator.data
    return {
        "read_at": data.read_at.isoformat() if data else None,
        "fresh": coordinator.is_fresh,
        "last_error": coordinator.last_error,
        "routes": coordinator.routes(),
        "vehicles": [vehicle.as_dict() for vehicle in data.vehicles] if data else [],
        "stops": {
            stop: {
                "title": place.title,
                "latitude": place.latitude,
                "longitude": place.longitude,
            }
            for stop, place in (data.stops if data else {}).items()
        },
    }


@websocket_api.websocket_command({probatio.Required("type"): "ttc/vehicles/subscribe"})
@websocket_api.async_response
async def ws_subscribe_vehicles(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Send vehicle positions while subscribed; polling stops when nobody is."""
    entry = async_get_entry(hass)
    if entry is None or (coordinator := entry.runtime_data.vehicles) is None:
        connection.send_error(
            msg["id"], "not_found", "Next departures are not being watched"
        )
        return

    @callback
    def forward() -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], vehicles_payload(coordinator))
        )

    # The listener is what keeps the coordinator polling.
    connection.subscriptions[msg["id"]] = coordinator.async_add_listener(forward)
    connection.send_result(msg["id"])
    if not coordinator.is_fresh:
        await coordinator.async_refresh()
    else:
        forward()


def _feed(coordinator: TTCFeedCoordinator[Any]) -> dict[str, Any]:
    next_attempt = coordinator.next_attempt
    return {
        "read_at": coordinator.last_read.isoformat() if coordinator.last_read else None,
        "fresh": coordinator.is_fresh,
        "last_error": coordinator.last_error,
        "failures": coordinator.failures,
        "next_attempt": next_attempt.isoformat() if next_attempt else None,
    }


def overview(hass: HomeAssistant, entry: TTCConfigEntry) -> dict[str, Any]:
    """Return everything the page shows, with when each part was read."""
    data = entry.runtime_data
    registry = er.async_get(hass)
    settings = entry_settings(entry)
    answers: list[LiveAlerts] = [
        coordinator.data
        for coordinator in (data.alerts, data.lifts)
        if coordinator is not None and coordinator.data is not None
    ]
    alerts = max(answers, key=lambda item: item.read_at) if answers else None
    result: dict[str, Any] = {
        "entry_id": entry.entry_id,
        "attribution": ATTRIBUTION,
        "now": dt_util.utcnow().isoformat(),
        "watch": {
            "alerts": bool(settings.get(CONF_WATCH_ALERTS)),
            "lifts": bool(settings.get(CONF_WATCH_LIFTS)),
            "departures": bool(settings.get(CONF_WATCH_DEPARTURES)),
        },
        "feeds": {
            coordinator.feed: _feed(coordinator) for coordinator in data.coordinators
        },
        "routes": [],
        "stations": [],
        "stops": [],
        "alerts": [],
        "alerts_read_at": alerts.read_at.isoformat() if alerts else None,
    }
    for route in data.routes:
        result["routes"].append(
            {
                "route": route,
                "name": route_name(route, data.route_titles),
                "subway": route in SUBWAY_LINES,
                "status_entity": registry.async_get_entity_id(
                    "sensor", DOMAIN, f"{entry.entry_id}_route_{route}_route_status"
                ),
                "status": alerts.route_status(route) if alerts else None,
                "alerts": [alert.as_dict() for alert in alerts.route_alerts(route)]
                if alerts
                else [],
            }
        )
    for station in data.stations:
        elevators = alerts.station_outages(station, KIND_ELEVATOR) if alerts else []
        escalators = alerts.station_outages(station, KIND_ESCALATOR) if alerts else []
        result["stations"].append(
            {
                "station": station,
                "known": alerts is not None,
                "step_free": not elevators if alerts else None,
                "elevators": [alert.as_dict() for alert in elevators],
                "escalators": [alert.as_dict() for alert in escalators],
            }
        )
    predictions = data.predictions
    for stop in data.stops:
        stop_data = (predictions.data or {}).get(stop) if predictions else None
        result["stops"].append(
            {
                "stop": stop,
                "title": stop_data.stop_title if stop_data else None,
                "read_at": stop_data.read_at.isoformat() if stop_data else None,
                "fresh": bool(predictions and predictions.stop_is_fresh(stop)),
                "departures": [item.as_dict() for item in stop_data.predictions]
                if stop_data
                else [],
                "idle_routes": list(stop_data.idle_routes) if stop_data else [],
            }
        )
    if alerts:
        result["alerts"] = [alert.as_dict() for alert in alerts.current]
    return result


@websocket_api.websocket_command({probatio.Required("type"): "ttc/overview"})
@callback
def ws_overview(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the overview of the loaded TTC transit entry."""
    if (entry := async_get_entry(hass)) is None:
        connection.send_error(msg["id"], "not_found", "TTC transit is not set up")
        return
    connection.send_result(msg["id"], overview(hass, entry))
