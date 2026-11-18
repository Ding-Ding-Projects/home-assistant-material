"""Constants of the AC Defender integration."""

from homeassistant.const import Platform

DOMAIN = "ac_defender"

PLATFORMS = [
    Platform.BUTTON,
    Platform.EVENT,
    Platform.NUMBER,
    Platform.SELECT,
    Platform.SENSOR,
    Platform.SWITCH,
]

CONF_CLIMATE = "climate_entity_id"
CONF_MY_TEMPERATURE = "my_temperature"
CONF_SAFETY_TEMPERATURE = "safety_temperature"
CONF_ROOM_SENSOR = "room_sensor"
CONF_DOOR_SENSOR = "door_sensor"
CONF_PRESENCE = "presence_entity"
CONF_OUTDOOR = "outdoor_entity"
CONF_POWER_KW = "power_kw"
CONF_GUARDS = "guards"
CONF_ENABLED_GUARDS = "enabled_guards"

# Heat Defender (the sister) options, shared here so the flows and the engine agree.
CONF_HEAT_MODE = "heat_mode"
CONF_HEAT_CAP = "heat_cap"
CONF_FLOOR = "floor"
CONF_FREEZE_RULE = "freeze_rule"

HEAT_MODE_OFF = "off"
HEAT_MODE_CAP = "cap"

DEFAULT_MY_TEMPERATURE = 23.0
DEFAULT_SAFETY_TEMPERATURE = 28.0
DEFAULT_FLOOR = 16.0
HARD_FLOOR = 10.0

EVALUATE_INTERVAL_SECONDS = 30
LOG_SIZE = 100

# Preset modes that mean the device protects itself; the defender never fights them.
PROTECTIVE_PRESETS = frozenset(
    {"away", "frost_protection", "frost", "freeze_protection", "vacation"}
)

STATE_DEFENDING = "defending"
STATE_WAITING = "waiting"
STATE_PAUSED = "paused"
STATE_STANDING_DOWN = "standing_down"
STATE_EMERGENCY = "emergency"
STATE_STOPPED = "stopped"
STATE_HEATING_ALLOWED = "heating_allowed"

STATES = [
    STATE_DEFENDING,
    STATE_WAITING,
    STATE_PAUSED,
    STATE_STANDING_DOWN,
    STATE_EMERGENCY,
    STATE_STOPPED,
    STATE_HEATING_ALLOWED,
]

HANDOVER_EVENT_TYPES = ["handover", "stop", "paused", "resumed", "safety"]

SERVICE_PAUSE = "pause"
SERVICE_STOP_EVERYTHING = "stop_everything"
SERVICE_DEFEND_AGAIN = "defend_again"
ATTR_HOURS = "hours"

DOMAIN_HEAT = "heat_defender"
EXTRA_EVENT_TYPES = ["heat_safety", "keep_heating_off"]
KEEP_OFF_GAP_SECONDS = 600
CONF_PLAIN_LOG = "plain_log"
ATTR_ALSO_SIBLING = "also_sibling"
BAND_ERRORS = ("band_crossed", "band_too_narrow", "band_under_floor")

STORAGE_VERSION = 1
SAVE_DELAY_SECONDS = 30
RESTART_FRESH_WAIT_MINUTES = 10
