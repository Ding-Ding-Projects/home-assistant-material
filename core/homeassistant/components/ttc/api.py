"""Client and data models for the TTC public information feeds."""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import re
from typing import Any

from aiohttp import ClientError, ClientSession

from homeassistant.util import dt as dt_util

from .const import (
    KIND_ELEVATOR,
    KIND_ESCALATOR,
    KIND_GENERAL,
    KIND_ROUTE,
    LIVE_ALERTS_URL,
    NEXTBUS_AGENCY,
    NEXTBUS_URL,
    REQUEST_TIMEOUT,
    ROUTE_STATUSES,
    STATUS_DELAY,
    STATUS_DETOUR,
    STATUS_NO_SERVICE,
    STATUS_REDUCED_SERVICE,
    STATUS_REGULAR,
    STATUS_SLOW,
    SUBWAY_LINES,
    USER_AGENT,
)

# "out of service between concourse and Line 2 westbound platform due to ..."
_DESTINATION = re.compile(
    r"\b(?:between .+? and|to) (.+?)(?=\s+(?:due|while|for|because)\b|[.,;]|$)",
    re.IGNORECASE,
)


class TTCError(Exception):
    """Base error for the TTC feeds."""


class TTCConnectionError(TTCError):
    """The feed could not be reached or timed out."""


class TTCRefusedError(TTCError):
    """The feed refused the request."""

    def __init__(self, status: int, retry_after: int | None) -> None:
        """Initialize the error."""
        super().__init__(f"Refused with status {status}")
        self.status = status
        self.retry_after = retry_after


class TTCDataError(TTCError):
    """The feed answered with something that could not be read."""


class TTCInvalidStopError(TTCError):
    """The stop number is not known to the predictions service."""


@dataclass(frozen=True, slots=True)
class ServiceAlert:
    """One alert as published by the agency."""

    alert_id: str
    kind: str
    routes: tuple[str, ...]
    route_type: str | None
    effect: str | None
    effect_description: str | None
    severity: str | None
    alert_type: str | None
    cause: str | None
    header_text: str
    direction: str | None
    stop_start: str | None
    stop_end: str | None
    station: str | None
    equipment_code: str | None
    last_updated: datetime | None
    start: datetime | None
    end: datetime | None
    current: bool

    @property
    def status(self) -> str:
        """Return the short route status this alert stands for."""
        effect = self.effect or ""
        description = (self.effect_description or "").lower()
        if effect == "NO_SERVICE":
            return STATUS_NO_SERVICE
        if effect == "REDUCED_SERVICE":
            return STATUS_REDUCED_SERVICE
        if effect == "DETOUR":
            return STATUS_DETOUR
        if effect == "SIGNIFICANT_DELAYS":
            if "reduced speed" in description or "slow" in description:
                return STATUS_SLOW
            return STATUS_DELAY
        return STATUS_DELAY

    @property
    def destination(self) -> str | None:
        """Return the place an elevator outage cuts off, when the text names one."""
        if self.kind != KIND_ELEVATOR:
            return None
        if match := _DESTINATION.search(self.header_text):
            return match.group(1).strip()
        return None

    def as_dict(self) -> dict[str, Any]:
        """Return the alert as plain data, with the agency's text as written."""
        return {
            "id": self.alert_id,
            "destination": self.destination,
            "kind": self.kind,
            "routes": list(self.routes),
            "route_type": self.route_type,
            "status": self.status if self.kind == KIND_ROUTE else None,
            "effect": self.effect,
            "effect_description": self.effect_description,
            "severity": self.severity,
            "alert_type": self.alert_type,
            "cause": self.cause,
            "text": self.header_text,
            "direction": self.direction,
            "stop_start": self.stop_start,
            "stop_end": self.stop_end,
            "station": self.station,
            "equipment": self.equipment_code,
            "last_updated": _iso(self.last_updated),
            "start": _iso(self.start),
            "end": _iso(self.end),
        }


@dataclass(frozen=True, slots=True)
class LiveAlerts:
    """The live alerts feed at one moment."""

    read_at: datetime
    feed_updated: datetime | None
    alerts: tuple[ServiceAlert, ...]

    @property
    def current(self) -> list[ServiceAlert]:
        """Return the alerts in effect now."""
        return [alert for alert in self.alerts if alert.current]

    def route_alerts(self, route: str) -> list[ServiceAlert]:
        """Return the alerts in effect for a route."""
        return [
            alert
            for alert in self.current
            if alert.kind == KIND_ROUTE and route in alert.routes
        ]

    def route_status(self, route: str) -> str:
        """Return the most severe status in effect for a route."""
        statuses = [alert.status for alert in self.route_alerts(route)]
        if not statuses:
            return STATUS_REGULAR
        return max(statuses, key=ROUTE_STATUSES.index)

    def station_outages(self, station: str, kind: str) -> list[ServiceAlert]:
        """Return the elevators or escalators out at a station."""
        wanted = normalize_station(station)
        return [
            alert
            for alert in self.current
            if alert.kind == kind
            and alert.station is not None
            and normalize_station(alert.station) == wanted
        ]


@dataclass(frozen=True, slots=True)
class Prediction:
    """One predicted arrival or departure at a stop."""

    route: str
    route_title: str
    direction: str
    time: datetime
    seconds: int
    trip: str | None
    vehicle: str | None
    is_departure: bool
    affected_by_layover: bool

    def as_dict(self) -> dict[str, Any]:
        """Return the prediction as plain data."""
        return {
            "route": self.route,
            "route_title": self.route_title,
            "direction": self.direction,
            "time": self.time.isoformat(),
            "seconds": self.seconds,
            "trip": self.trip,
            "vehicle": self.vehicle,
            "is_departure": self.is_departure,
            "affected_by_layover": self.affected_by_layover,
        }


@dataclass(frozen=True, slots=True)
class StopPredictions:
    """The predictions for one stop at one moment."""

    stop: str
    stop_title: str | None
    read_at: datetime
    predictions: tuple[Prediction, ...]
    idle_routes: tuple[str, ...] = field(default=())

    def for_route(self, route: str | None) -> list[Prediction]:
        """Return the predictions, optionally for one route only."""
        if route is None:
            return list(self.predictions)
        return [item for item in self.predictions if item.route == route]


@dataclass(frozen=True, slots=True)
class RouteStop:
    """A stop served by a route."""

    stop: str
    title: str
    latitude: float | None = None
    longitude: float | None = None


@dataclass(frozen=True, slots=True)
class Vehicle:
    """A vehicle position as reported by the vehicle itself."""

    vehicle: str
    route: str
    latitude: float
    longitude: float
    heading: int | None
    seconds_since_report: int
    direction: str | None
    predictable: bool

    def as_dict(self) -> dict[str, Any]:
        """Return the position as plain data."""
        return {
            "vehicle": self.vehicle,
            "route": self.route,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "heading": self.heading,
            "seconds_since_report": self.seconds_since_report,
            "direction": self.direction,
            "predictable": self.predictable,
        }


def parse_vehicles(payload: Any, route: str) -> list[Vehicle]:
    """Parse the vehicle locations of one route."""
    if not isinstance(payload, dict) or "Error" in payload:
        raise TTCDataError("The vehicle locations did not have the expected shape")
    try:
        return [
            Vehicle(
                vehicle=str(item["id"]),
                route=str(item.get("routeTag") or route),
                latitude=float(item["lat"]),
                longitude=float(item["lon"]),
                heading=int(item["heading"]) if item.get("heading") else None,
                seconds_since_report=int(item.get("secsSinceReport") or 0),
                direction=item.get("dirTag"),
                predictable=item.get("predictable") == "true",
            )
            for item in _as_list(payload.get("vehicle"))
        ]
    except (KeyError, TypeError, ValueError) as err:
        raise TTCDataError("A vehicle could not be read") from err


def normalize_station(name: str) -> str:
    """Return a station name in a form that can be compared."""
    cleaned = name.lower().replace("station", "").replace(".", "").replace("'", "")
    return " ".join(cleaned.replace("-", " ").split())


def route_name(route: str, titles: dict[str, str]) -> str:
    """Return a readable name for a route number."""
    if route in SUBWAY_LINES:
        return SUBWAY_LINES[route]
    if title := titles.get(route):
        return title.replace("-", " ", 1) if title.startswith(f"{route}-") else title
    return route


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or value.startswith("0001-"):
        return None
    return dt_util.parse_datetime(value)


def _as_list(value: Any) -> list[Any]:
    """Return a list, as the predictions service drops single item lists."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _parse_alert(raw: dict[str, Any], kind: str) -> ServiceAlert:
    header = str(raw.get("customHeaderText") or raw.get("headerText") or "")
    if not header:
        header = str(raw.get("title") or "")
    station: str | None = None
    if kind in (KIND_ELEVATOR, KIND_ESCALATOR) and ":" in header:
        station = header.split(":", 1)[0].strip()
    routes = tuple(
        part.strip() for part in str(raw.get("route") or "").split(",") if part.strip()
    )
    period = raw.get("activePeriod") or {}
    groups = raw.get("activePeriodGroup") or ["Current"]
    equipment = raw.get("elevatorCode") or raw.get("escalatorCode")
    return ServiceAlert(
        alert_id=str(raw["id"]),
        kind=kind,
        routes=routes,
        route_type=raw.get("routeType"),
        effect=raw.get("effect"),
        effect_description=raw.get("effectDesc"),
        severity=raw.get("severity"),
        alert_type=raw.get("alertType"),
        cause=raw.get("causeDescription"),
        header_text=header,
        direction=raw.get("direction"),
        stop_start=raw.get("stopStart"),
        stop_end=raw.get("stopEnd"),
        station=station,
        equipment_code=str(equipment) if equipment else None,
        last_updated=_parse_time(raw.get("lastUpdated")),
        start=_parse_time(period.get("start")),
        end=_parse_time(period.get("end")),
        current="Current" in groups,
    )


def parse_live_alerts(payload: Any, read_at: datetime) -> LiveAlerts:
    """Parse the live alerts feed."""
    if not isinstance(payload, dict) or not isinstance(payload.get("routes"), list):
        raise TTCDataError("The alerts feed did not have the expected shape")
    alerts: list[ServiceAlert] = []
    try:
        alerts.extend(_parse_alert(raw, KIND_ROUTE) for raw in payload["routes"])
        for raw in payload.get("accessibility") or []:
            route_type = str(raw.get("routeType") or raw.get("accessibility") or "")
            kind = KIND_ELEVATOR if "elevator" in route_type.lower() else KIND_ESCALATOR
            alerts.append(_parse_alert(raw, kind))
        for key in ("siteWide", "siteWideCustom", "generalCustom"):
            alerts.extend(
                _parse_alert(raw, KIND_GENERAL)
                for raw in _as_list(payload.get(key))
                if isinstance(raw, dict)
            )
    except (KeyError, TypeError, ValueError) as err:
        raise TTCDataError("An alert could not be read") from err
    return LiveAlerts(
        read_at=read_at,
        feed_updated=_parse_time(payload.get("lastUpdated")),
        alerts=tuple(alerts),
    )


def _parse_prediction(
    route: str, title: str, direction: dict[str, Any], item: dict[str, Any]
) -> Prediction:
    return Prediction(
        route=route,
        route_title=title,
        direction=str(direction.get("title") or ""),
        time=dt_util.utc_from_timestamp(int(item["epochTime"]) / 1000),
        seconds=int(item["seconds"]),
        trip=item.get("tripTag"),
        vehicle=item.get("vehicle"),
        is_departure=item.get("isDeparture") == "true",
        affected_by_layover=item.get("affectedByLayover") == "true",
    )


def parse_predictions(payload: Any, stop: str, read_at: datetime) -> StopPredictions:
    """Parse the predictions for one stop."""
    if not isinstance(payload, dict):
        raise TTCDataError("The predictions did not have the expected shape")
    if "Error" in payload:
        raise TTCInvalidStopError(stop)
    predictions: list[Prediction] = []
    idle: list[str] = []
    stop_title: str | None = None
    try:
        for route_block in _as_list(payload.get("predictions")):
            stop_title = stop_title or route_block.get("stopTitle")
            route = str(route_block["routeTag"])
            title = str(route_block.get("routeTitle") or route)
            directions = _as_list(route_block.get("direction"))
            if not directions:
                idle.append(route)
            for direction in directions:
                predictions.extend(
                    _parse_prediction(route, title, direction, item)
                    for item in _as_list(direction.get("prediction"))
                )
    except (KeyError, TypeError, ValueError, AttributeError) as err:
        raise TTCDataError("A prediction could not be read") from err
    predictions.sort(key=lambda item: item.time)
    return StopPredictions(
        stop=stop,
        stop_title=stop_title,
        read_at=read_at,
        predictions=tuple(predictions),
        idle_routes=tuple(idle),
    )


class TTCClient:
    """Reads the TTC public feeds. Nothing is sent except the chosen numbers."""

    def __init__(self, session: ClientSession) -> None:
        """Initialize the client."""
        self._session = session
        self._alerts: LiveAlerts | None = None
        self._alerts_lock = asyncio.Lock()

    async def _get_json(self, url: str, params: dict[str, str] | None = None) -> Any:
        try:
            async with asyncio.timeout(REQUEST_TIMEOUT):
                response = await self._session.get(
                    url,
                    params=params,
                    headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                )
                if response.status in (403, 429, 503):
                    retry = response.headers.get("Retry-After")
                    raise TTCRefusedError(
                        response.status,
                        int(retry) if retry and retry.isdigit() else None,
                    )
                if response.status >= 400:
                    raise TTCConnectionError(f"Answered with status {response.status}")
                return await response.json(content_type=None)
        except TimeoutError as err:
            raise TTCConnectionError("The request timed out") from err
        except ClientError as err:
            raise TTCConnectionError(str(err)) from err
        except ValueError as err:
            raise TTCDataError("The answer was not JSON") from err

    async def async_get_live_alerts(
        self, max_age: timedelta | None = None
    ) -> LiveAlerts:
        """Return the live alerts, reusing a recent answer when allowed."""
        async with self._alerts_lock:
            now = dt_util.utcnow()
            if (
                max_age is not None
                and self._alerts is not None
                and now - self._alerts.read_at < max_age
            ):
                return self._alerts
            payload = await self._get_json(LIVE_ALERTS_URL)
            self._alerts = parse_live_alerts(payload, now)
            return self._alerts

    async def async_get_predictions(self, stop: str) -> StopPredictions:
        """Return the predictions for one stop number."""
        payload = await self._get_json(
            NEXTBUS_URL,
            {"command": "predictions", "a": NEXTBUS_AGENCY, "stopId": stop},
        )
        return parse_predictions(payload, stop, dt_util.utcnow())

    async def async_get_routes(self) -> dict[str, str]:
        """Return the surface routes with their titles."""
        payload = await self._get_json(
            NEXTBUS_URL, {"command": "routeList", "a": NEXTBUS_AGENCY}
        )
        if not isinstance(payload, dict):
            raise TTCDataError("The route list did not have the expected shape")
        try:
            return {
                str(item["tag"]): str(item["title"])
                for item in _as_list(payload.get("route"))
            }
        except (KeyError, TypeError) as err:
            raise TTCDataError("A route could not be read") from err

    async def async_get_vehicles(self, route: str) -> list[Vehicle]:
        """Return the reported positions of one surface route's vehicles."""
        payload = await self._get_json(
            NEXTBUS_URL,
            {"command": "vehicleLocations", "a": NEXTBUS_AGENCY, "r": route, "t": "0"},
        )
        return parse_vehicles(payload, route)

    async def async_get_route_stops(self, route: str) -> list[RouteStop]:
        """Return the stops a surface route serves."""
        payload = await self._get_json(
            NEXTBUS_URL,
            {"command": "routeConfig", "a": NEXTBUS_AGENCY, "r": route, "terse": ""},
        )
        if not isinstance(payload, dict) or "route" not in payload:
            return []
        try:
            return [
                RouteStop(
                    stop=str(item["stopId"]),
                    title=str(item["title"]),
                    latitude=float(item["lat"]) if item.get("lat") else None,
                    longitude=float(item["lon"]) if item.get("lon") else None,
                )
                for item in _as_list(payload["route"].get("stop"))
                if item.get("stopId")
            ]
        except (KeyError, TypeError, AttributeError) as err:
            raise TTCDataError("A stop could not be read") from err
