"""Constants for the TTC transit integration."""

from datetime import timedelta
import logging
from typing import Final

DOMAIN: Final = "ttc"
LOGGER = logging.getLogger(__package__)

ATTRIBUTION: Final = (
    "Contains information licensed under the Open Government Licence - Toronto"
)

CONF_WATCH_ALERTS: Final = "watch_alerts"
CONF_WATCH_LIFTS: Final = "watch_lifts"
CONF_WATCH_DEPARTURES: Final = "watch_departures"
CONF_ROUTES: Final = "routes"
CONF_STATIONS: Final = "stations"
CONF_STOPS: Final = "stops"

LIVE_ALERTS_URL: Final = "https://alerts.ttc.ca/api/alerts/live-alerts"
NEXTBUS_URL: Final = "https://retro.umoiq.com/service/publicJSONFeed"
NEXTBUS_AGENCY: Final = "ttc"
USER_AGENT: Final = "HomeAssistantMaterial-TTC/1.0"
REQUEST_TIMEOUT: Final = 20

ALERTS_INTERVAL: Final = timedelta(seconds=60)
LIFTS_INTERVAL: Final = timedelta(minutes=3)
PREDICTIONS_INTERVAL: Final = timedelta(seconds=45)
VEHICLES_INTERVAL: Final = timedelta(seconds=25)
STATIC_INTERVAL: Final = timedelta(days=1)
MAX_BACKOFF: Final = timedelta(minutes=15)

# Figures older than these are not shown as current.
ALERTS_STALE_AFTER: Final = timedelta(minutes=10)
LIFTS_STALE_AFTER: Final = timedelta(minutes=20)
PREDICTIONS_STALE_AFTER: Final = timedelta(minutes=3)
VEHICLES_STALE_AFTER: Final = timedelta(minutes=2)

FEED_ALERTS: Final = "alerts"
FEED_LIFTS: Final = "lifts"
FEED_DEPARTURES: Final = "departures"
FEED_VEHICLES: Final = "vehicles"

STATUS_REGULAR: Final = "regular"
STATUS_SLOW: Final = "slow"
STATUS_DELAY: Final = "delay"
STATUS_DETOUR: Final = "detour"
STATUS_REDUCED_SERVICE: Final = "reduced_service"
STATUS_NO_SERVICE: Final = "no_service"

# Ordered from least to most severe.
ROUTE_STATUSES: Final = [
    STATUS_REGULAR,
    STATUS_SLOW,
    STATUS_DELAY,
    STATUS_DETOUR,
    STATUS_REDUCED_SERVICE,
    STATUS_NO_SERVICE,
]

KIND_ROUTE: Final = "route"
KIND_ELEVATOR: Final = "elevator"
KIND_ESCALATOR: Final = "escalator"
KIND_GENERAL: Final = "general"
ALERT_KINDS: Final = [KIND_ROUTE, KIND_ELEVATOR, KIND_ESCALATOR, KIND_GENERAL]

SUBWAY_LINES: Final[dict[str, str]] = {
    "1": "Line 1 Yonge-University",
    "2": "Line 2 Bloor-Danforth",
    "4": "Line 4 Sheppard",
    "5": "Line 5 Eglinton",
    "6": "Line 6 Finch West",
}

# Rapid transit stations offered when choosing stations. Names follow the
# agency's alerts, which start with the station name. Other names can be typed.
STATIONS: Final = sorted(
    {
        "Bathurst",
        "Bay",
        "Bayview",
        "Bessarion",
        "Birchmount",
        "Bloor-Yonge",
        "Broadview",
        "Caledonia",
        "Castle Frank",
        "Cedarvale",
        "Chaplin",
        "Chester",
        "Christie",
        "College",
        "Coxwell",
        "Davisville",
        "Don Mills",
        "Donlands",
        "Downsview Park",
        "Dufferin",
        "Dundas",
        "Dundas West",
        "Dupont",
        "Eglinton",
        "Finch",
        "Finch West",
        "Forest Hill",
        "Glencairn",
        "Golden Mile",
        "Greenwood",
        "High Park",
        "Highway 407",
        "Islington",
        "Jane",
        "Keele",
        "Keelesdale",
        "Kennedy",
        "King",
        "Kipling",
        "Lansdowne",
        "Lawrence",
        "Lawrence West",
        "Leslie",
        "Main Street",
        "Museum",
        "North York Centre",
        "Old Mill",
        "Osgoode",
        "Ossington",
        "Pape",
        "Pioneer Village",
        "Queen",
        "Queen's Park",
        "Rosedale",
        "Royal York",
        "Runnymede",
        "Science Centre",
        "Sheppard West",
        "Sheppard-Yonge",
        "Sherbourne",
        "Spadina",
        "St Andrew",
        "St Clair",
        "St Clair West",
        "St George",
        "St Patrick",
        "Summerhill",
        "Union",
        "Vaughan Metropolitan Centre",
        "Victoria Park",
        "Warden",
        "Wellesley",
        "Wilson",
        "Woodbine",
        "York Mills",
        "York University",
        "Yorkdale",
    }
)
