"""Constants for the Ollama suite integration."""

from typing import Final

DOMAIN: Final = "ollama_suite"

# The existing Ollama integration owns the server addresses.
OLLAMA_DOMAIN: Final = "ollama"

# Seconds to wait for one request to an Ollama server.
REQUEST_TIMEOUT: Final = 10.0

# Caps that keep one answer small, whatever the server sends.
MAX_MODELS: Final = 500
MAX_RUNNING: Final = 100
MAX_TEXT_LENGTH: Final = 20_000
MAX_INFO_ITEMS: Final = 200
MAX_INFO_VALUE_LENGTH: Final = 500
MAX_NAME_LENGTH: Final = 256

# Seconds a download may go without any progress before it is stopped.
PULL_IDLE_TIMEOUT: Final = 120.0

# Seconds between progress events sent to the browser for one download.
PULL_EVENT_INTERVAL: Final = 0.25

# Largest answer, in bytes, read from the small version call.
MAX_VERSION_BYTES: Final = 4096
