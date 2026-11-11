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
