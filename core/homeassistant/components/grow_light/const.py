"""Constants for the Grow light helper."""

DOMAIN = "grow_light"

CONF_PLUG = "plug"
CONF_START = "start"
CONF_HOURS = "hours"
CONF_DOORS = "doors"
CONF_PLANT = "plant"
CONF_PLANTED_ON = "planted_on"
CONF_WATER_DAYS = "water_days"
CONF_WATER_SWITCH = "water_switch"
CONF_WATER_MINUTES = "water_minutes"

DEFAULT_START = "06:00:00"
DEFAULT_HOURS = 14.0
DEFAULT_WATER_DAYS = 0
DEFAULT_WATER_MINUTES = 2.0

PLANT_CUSTOM = "custom"
PHOTO_URL = "/grow_light/photos"

STATUS_ON = "on"
STATUS_PAUSED = "paused"
STATUS_OFF_HOURS = "off_hours"
STATUS_SCHEDULE_OFF = "schedule_off"
STATUSES = [STATUS_ON, STATUS_PAUSED, STATUS_OFF_HOURS, STATUS_SCHEDULE_OFF]
