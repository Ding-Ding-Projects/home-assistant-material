"""Constants for camera recording."""

import logging
from typing import Final

DOMAIN: Final = "camera_recording"
LOGGER = logging.getLogger(__package__)

# Where recordings go.
CONF_DESTINATION: Final = "destination"
DEST_LOCAL: Final = "local"
DEST_USB: Final = "external_disk"
DEST_SMB: Final = "smb"
DEST_SFTP: Final = "sftp"
DEST_SCP: Final = "scp"
DESTINATIONS: Final = (DEST_LOCAL, DEST_USB, DEST_SMB, DEST_SFTP, DEST_SCP)

CONF_PATH: Final = "path"
CONF_SHARE: Final = "share"
CONF_DOMAIN: Final = "domain"
CONF_PRIVATE_KEY_FILE: Final = "private_key_file"

# What and how long.
CONF_CAMERAS: Final = "cameras"
CONF_KEEP_DAYS: Final = "keep_days"
CONF_MAX_GB: Final = "max_gb"
CONF_BUFFER_HOURS: Final = "buffer_hours"
CONF_SEGMENT_MINUTES: Final = "segment_minutes"

DEFAULT_KEEP_DAYS: Final = 14
DEFAULT_MAX_GB: Final = 0  # 0 means no space limit, only the age limit.
DEFAULT_BUFFER_HOURS: Final = 6
DEFAULT_SEGMENT_MINUTES: Final = 5

SMB_PORT: Final = 445
SSH_PORT: Final = 22

# A segment is finished when ffmpeg has started the next one, or when it has not
# changed for this long after its planned end.
SEGMENT_GRACE_SECONDS: Final = 30
UPLOAD_INTERVAL_SECONDS: Final = 10
RETENTION_INTERVAL_SECONDS: Final = 600
RESTART_BACKOFF_SECONDS: Final = (2, 5, 10, 30, 60)

TEST_FILE_NAME: Final = ".home-assistant-recording-test"
SEGMENT_SUFFIX: Final = ".mp4"
# Segment files are named by their start time in UTC.
SEGMENT_TIME_FORMAT: Final = "%Y%m%dT%H%M%SZ"

STORAGE_VERSION: Final = 1
