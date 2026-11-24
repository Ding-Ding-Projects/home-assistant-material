"""Constants for the Safety cutoff helper."""

DOMAIN = "safety_cutoff"

CONF_LEAKS = "leaks"
CONF_SWITCHES = "switches"
CONF_POWER_SENSOR = "power_sensor"
CONF_POWER_LIMIT = "power_limit"
CONF_POWER_SECONDS = "power_seconds"
CONF_CUT_ON_POWER = "cut_on_power"
CONF_NOTIFY = "notify"

DEFAULT_POWER_LIMIT = 1500.0
DEFAULT_POWER_SECONDS = 60

CAUSE_LEAK = "leak"
CAUSE_POWER = "power"
CAUSE_NONE = "none"
CAUSES = [CAUSE_LEAK, CAUSE_POWER, CAUSE_NONE]

EVENT_TRIPPED = "safety_cutoff_tripped"

ATTR_CAUSE = "cause"
ATTR_SINCE = "since"
