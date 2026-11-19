"""Constants for linked media."""

from enum import StrEnum
from typing import Final

DOMAIN: Final = "linked_media"

STORAGE_KEY: Final = DOMAIN
STORAGE_VERSION: Final = 1

FETCH_EACH_TIME: Final = "each_time"
FETCH_KEEP: Final = "keep"
FETCH_RULES: Final = (FETCH_EACH_TIME, FETCH_KEEP)

DEFAULT_MAX_SIZE_MB: Final = 200
MIN_MAX_SIZE_MB: Final = 1
MAX_MAX_SIZE_MB: Final = 2000

# How long a kept copy stays after it was last used.
KEEP_SECONDS: Final = 600
# A copy made for a player that asks for byte ranges stays this long after its
# last reader, because players ask for the next range a moment later.
READER_GRACE_SECONDS: Final = 30

CONNECT_TIMEOUT: Final = 10
READ_IDLE_TIMEOUT: Final = 30
TOTAL_TIMEOUT: Final = 3600
CHECK_TIMEOUT: Final = 15
MAX_REDIRECTS: Final = 3
CHUNK_SIZE: Final = 64 * 1024

DEFAULT_FILE_SECONDS: Final = 300
MAX_FILE_SECONDS: Final = 3600

USER_AGENT: Final = "HomeAssistant-LinkedMedia/1"

EVENT_USED: Final = "linked_media_used"
EVENT_FAILED: Final = "linked_media_failed"

KIND_AUDIO: Final = "audio"
KIND_VIDEO: Final = "video"
KIND_IMAGE: Final = "image"


class FailureReason(StrEnum):
    """Plain reasons a linked file could not be fetched."""

    NOT_FOUND = "not_found"
    HTTP_ERROR = "http_error"
    TIMEOUT = "timeout"
    CANNOT_CONNECT = "cannot_connect"
    TOO_LARGE = "too_large"
    UNSUPPORTED_TYPE = "unsupported_type"
    PLAYLIST_NOT_SUPPORTED = "playlist_not_supported"
    TOO_MANY_REDIRECTS = "too_many_redirects"
    INTERNAL_ADDRESS = "internal_address"
    BLOCKED_ADDRESS = "blocked_address"
    INVALID_ADDRESS = "invalid_address"


class LinkedMediaService(StrEnum):
    """Actions of linked media."""

    FETCH = "fetch"
    RELEASE = "release"


class LinkedMediaServiceArgument(StrEnum):
    """Fields of the linked media actions."""

    FILE_ID = "file_id"
    SECONDS = "seconds"
    PATH = "path"
