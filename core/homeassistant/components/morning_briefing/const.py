"""Constants for the Morning briefing helper."""

DOMAIN = "morning_briefing"

CONF_TIME = "time"
CONF_NOTIFY = "notify"
CONF_WEATHER = "weather"
CONF_TRANSIT = "transit"
CONF_EXTRA = "extra"

DEFAULT_TIME = "07:30:00"

EVENT_SENT = "morning_briefing_sent"

GROW_LIGHT_DOMAIN = "grow_light"
STAGE_HARVEST = "harvest"
STATUS_PAUSED = "paused"

# Transit states that mean there is nothing to report.
TRANSIT_QUIET_STATES = frozenset(
    {"", "none", "off", "ok", "normal", "unknown", "unavailable"}
)
