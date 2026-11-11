"""Constants for the Passkey integration."""

from datetime import timedelta
from typing import Final

DOMAIN: Final = "passkey"

STORAGE_KEY: Final = "passkey"
STORAGE_VERSION: Final = 1

RP_NAME: Final = "Home Assistant"

CHALLENGE_BYTES: Final = 32
CHALLENGE_TTL: Final = timedelta(minutes=5)
CEREMONY_TIMEOUT_MS: Final = 300_000

MAX_PENDING_REGISTRATIONS_PER_USER: Final = 3
MAX_PENDING_REGISTRATIONS: Final = 500
MAX_USED_SIGN_IN_TOKENS: Final = 10_000
MAX_USED_PER_REMOTE: Final = 100
REGISTRATION_FRESH_WINDOW: Final = timedelta(minutes=10)
MAX_PASSKEYS_PER_USER: Final = 20
MAX_NAME_LENGTH: Final = 64
MAX_CREDENTIAL_ID_BYTES: Final = 1023

DEFAULT_PASSKEY_NAME: Final = "Passkey"

SIGN_IN_FAILED_MESSAGE: Final = "Passkey sign-in failed"
UNAVAILABLE_MESSAGE: Final = "Passkey sign-in is not available on this address"
ERR_RECENT_SIGN_IN_REQUIRED: Final = "recent_sign_in_required"

BEGIN_URL: Final = "/auth/passkey/begin"
FINISH_URL: Final = "/auth/passkey/finish"
STATUS_URL: Final = "/auth/passkey/status"
MAX_TOKEN_LENGTH: Final = 8192

KNOWN_TRANSPORTS: Final = frozenset(
    {"usb", "nfc", "ble", "smart-card", "hybrid", "internal"}
)
