"""Constants for the dim sum surprise integration."""

from datetime import timedelta
import re
from typing import Final

DOMAIN: Final = "dim_sum"

# The only places anything is fetched from: the public catalogue repository.
CATALOG_URL: Final = (
    "https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/"
    "catalog/index.json"
)
RELEASES_URL: Final = (
    "https://api.github.com/repos/Ding-Ding-Projects/dim-sum-photos/releases"
    "?per_page=100&page={page}"
)
ASSET_URL_PREFIX: Final = (
    "https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/"
)
# Only releases with this tag prefix hold the published pictures.
RELEASE_TAG_PREFIX: Final = "catalog-v1"
RELEASE_MAX_PAGES: Final = 3

# What is sent with a request: a plain GET, a generic agent and nothing else.
USER_AGENT: Final = "Mozilla/5.0 (compatible; dim-sum-surprise)"
ACCEPT_JSON: Final = "application/json"
ACCEPT_IMAGE: Final = "image/png,application/octet-stream"

# Hosts a request may end on after redirects.
ALLOWED_FINAL_HOSTS: Final = (
    "raw.githubusercontent.com",
    "api.github.com",
    "github.com",
)
ALLOWED_FINAL_HOST_SUFFIX: Final = ".githubusercontent.com"

# Size and time bounds.
CATALOG_MAX_BYTES: Final = 32 * 1024 * 1024
RELEASES_MAX_BYTES: Final = 16 * 1024 * 1024
PICTURE_MAX_BYTES: Final = 12 * 1024 * 1024
CATALOG_TIMEOUT: Final = 60
PICTURE_TIMEOUT: Final = 20
CATALOG_MAX_DISHES: Final = 20000
NAME_MAX_LENGTH: Final = 200

# The catalogue is refreshed at most once a day, and a failure is not retried
# sooner than the backoff.
REFRESH_INTERVAL: Final = timedelta(days=1)
FAILURE_BACKOFF: Final = timedelta(hours=1)

# Pictures kept in the cache, and pictures fetched ahead after a start.
PICTURE_CACHE_MAX: Final = 48
PICTURE_WARM_COUNT: Final = 6

PICTURE_CONTENT_TYPE: Final = "image/png"
PNG_MAGIC: Final = b"\x89PNG\r\n\x1a\n"
# What a download may announce: the picture's type, or a plain byte stream.
ACCEPTED_FETCH_TYPES: Final = ("image/png", "application/octet-stream")

# A dish id is a short slug; it becomes a file name, so nothing else passes.
ID_PATTERN: Final = re.compile(r"[a-z0-9][a-z0-9-]{0,127}")

PICTURE_URL: Final = "/api/dim_sum/picture/{picture_id}"
PICTURE_VIEW_URL: Final = "/api/dim_sum/picture/{picture_id}"
SIGNED_PATH_LIFETIME: Final = timedelta(minutes=5)

STORAGE_KEY: Final = "dim_sum_catalog"
STORAGE_VERSION: Final = 1
PICTURE_DIR: Final = "dim_sum_pictures"
