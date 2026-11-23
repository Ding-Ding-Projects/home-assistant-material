"""Constants for the Grow light helper."""

DOMAIN = "grow_light"

CONF_PLUG = "plug"
CONF_START = "start"
CONF_HOURS = "hours"
CONF_DOORS = "doors"

DEFAULT_START = "06:00:00"
DEFAULT_HOURS = 14.0

STATUS_ON = "on"
STATUS_PAUSED = "paused"
STATUS_OFF_HOURS = "off_hours"
STATUS_SCHEDULE_OFF = "schedule_off"
STATUSES = [STATUS_ON, STATUS_PAUSED, STATUS_OFF_HOURS, STATUS_SCHEDULE_OFF]
