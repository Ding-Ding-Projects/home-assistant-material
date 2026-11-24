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
CONF_NOTIFY = "notify"
CONF_MOISTURE = "moisture"
CONF_DRY_BELOW = "dry_below"
CONF_WATTS = "watts"
CONF_POWER = "power"
CONF_PRICE = "price"
CONF_RESOW_DAYS = "resow_days"

DEFAULT_START = "06:00:00"
DEFAULT_HOURS = 14.0
DEFAULT_WATER_DAYS = 0
DEFAULT_WATER_MINUTES = 2.0
DEFAULT_DRY_BELOW = 30.0
DEFAULT_WATTS = 0.0
DEFAULT_PRICE = 0.0
DEFAULT_RESOW_DAYS = 0

PLANT_CUSTOM = "custom"
PHOTO_URL = "/grow_light/photos"

STATUS_ON = "on"
STATUS_PAUSED = "paused"
STATUS_OFF_HOURS = "off_hours"
STATUS_SCHEDULE_OFF = "schedule_off"
STATUSES = [STATUS_ON, STATUS_PAUSED, STATUS_OFF_HOURS, STATUS_SCHEDULE_OFF]

EVENT_ALERT = "grow_light_alert"
ALERT_STAGE_CHANGED = "stage_changed"
ALERT_READY_TO_HARVEST = "ready_to_harvest"
ALERT_WATER_DUE = "water_due"
ALERT_WATERED = "watered"
ALERT_SOIL_DRY = "soil_dry"
ALERT_SOW_NEXT = "sow_next"
ALERTS = [
    ALERT_STAGE_CHANGED,
    ALERT_READY_TO_HARVEST,
    ALERT_WATER_DUE,
    ALERT_WATERED,
    ALERT_SOIL_DRY,
    ALERT_SOW_NEXT,
]
