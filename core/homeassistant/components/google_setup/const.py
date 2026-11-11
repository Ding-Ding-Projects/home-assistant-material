"""Constants for Google setup."""

from typing import Final

DOMAIN: Final = "google_setup"

# The only two hosts this integration ever talks to.
TOKEN_URL: Final = "https://oauth2.googleapis.com/token"
SERVICE_USAGE_URL: Final = "https://serviceusage.googleapis.com/v1"

# Scope the Service Usage API requires to enable a service.
SCOPE: Final = "https://www.googleapis.com/auth/service.management"

# Google APIs the integrations need, keyed by a short identifier the interface
# uses. The value is the Service Usage service name.
GOOGLE_APIS: Final[dict[str, str]] = {
    "drive": "drive.googleapis.com",
    "calendar": "calendar-json.googleapis.com",
    "gmail": "gmail.googleapis.com",
    "sheets": "sheets.googleapis.com",
    "tasks": "tasks.googleapis.com",
    "photos": "photoslibrary.googleapis.com",
    "youtube": "youtube.googleapis.com",
    "nest": "smartdevicemanagement.googleapis.com",
    "assistant": "embeddedassistant.googleapis.com",
    "pubsub": "pubsub.googleapis.com",
}

# Integration domains that sign in with a Google OAuth client.
GOOGLE_DOMAINS: Final[tuple[str, ...]] = (
    "google",
    "google_drive",
    "google_mail",
    "google_sheets",
    "google_tasks",
    "google_photos",
    "youtube",
    "nest",
    "google_assistant_sdk",
)

REQUEST_TIMEOUT: Final = 20
# How long to wait for a freshly enabled API to report as enabled.
POLL_ATTEMPTS: Final = 8
POLL_DELAY: Final = 2.0
