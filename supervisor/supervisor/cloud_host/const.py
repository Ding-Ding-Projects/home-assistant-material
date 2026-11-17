"""Constants for the cloud host."""

from enum import StrEnum
import re
from typing import Final

STATE_FILE: Final = "cloud_host.json"
MANIFEST_PATH: Final = "/manifest.json"
CHECK_TIMEOUT_SECONDS: Final = 10

ATTR_CHECK_OK: Final = "ok"
ATTR_CHECK_REASON: Final = "reason"
ATTR_CHECK_STATUS: Final = "status"
ATTR_CHECK_TIME: Final = "time"
ATTR_ERROR: Final = "error"
ATTR_LAST_CHECK: Final = "last_check"
ATTR_PAUSED: Final = "paused"
ATTR_SIGN_IN_URL: Final = "sign_in_url"

# Letters, digits and inner hyphens in each label, two or more labels, a letter-led last label
RE_HOSTNAME: Final = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$"
)

RUNNER_NOT_INSTALLED: Final = "tunnel runner not installed"


class CloudHostState(StrEnum):
    """State of the cloud host."""

    NOT_SET_UP = "not_set_up"
    WAITING_FOR_SIGN_IN = "waiting_for_sign_in"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"
