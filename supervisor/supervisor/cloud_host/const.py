"""Constants for the cloud host."""

from enum import StrEnum
import re
from typing import Final

from ..const import DOCKER_PREFIX

STATE_FILE: Final = "cloud_host.json"
MANIFEST_PATH: Final = "/manifest.json"
CHECK_TIMEOUT_SECONDS: Final = 10

ATTR_CHECK_OK: Final = "ok"
ATTR_CHECK_REASON: Final = "reason"
ATTR_CHECK_STATUS: Final = "status"
ATTR_CHECK_TIME: Final = "time"
ATTR_ERROR: Final = "error"
ATTR_LAST_CHECK: Final = "last_check"
ATTR_NOTE: Final = "note"
ATTR_PAUSED: Final = "paused"
ATTR_SIGN_IN_URL: Final = "sign_in_url"

# Letters, digits and inner hyphens in each label, two or more labels, a letter-led last label
RE_HOSTNAME: Final = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$"
)

RUNNER_NOT_INSTALLED: Final = "tunnel runner not installed"

ATTR_TRUSTED_PROXY: Final = "trusted_proxy"

# Same pin as compose.yaml
CLIENT_IMAGE: Final = "cloudflare/cloudflared"
CLIENT_TAG: Final = "2025.11.1"
CLIENT_USER_ID: Final = 65532
CLIENT_DATA_TARGET: Final = "/home/nonroot/.cloudflared"
CLIENT_CERT_FILE: Final = "cert.pem"
TUNNEL_NAME_FILE: Final = "tunnel_name"
DATA_FOLDER: Final = "cloud_host_tunnel"

LOGIN_DOCKER_NAME: Final = f"{DOCKER_PREFIX}_cloud_login"
TUNNEL_DOCKER_NAME: Final = f"{DOCKER_PREFIX}_cloud_tunnel"

SIGN_IN_HOST: Final = "dash.cloudflare.com"
SIGN_IN_POLL_SECONDS: Final = 0.5
SIGN_IN_TIMEOUT_SECONDS: Final = 30
STEP_TIMEOUT_SECONDS: Final = 90
PULL_TIMEOUT_SECONDS: Final = 300
STOP_TIMEOUT_SECONDS: Final = 10


class CloudHostState(StrEnum):
    """State of the cloud host."""

    NOT_SET_UP = "not_set_up"
    WAITING_FOR_SIGN_IN = "waiting_for_sign_in"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"
