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

# Largest count shown: the largest integer a browser keeps exactly.
MAX_COUNT: Final = 2**53

# Seconds a download may go without any progress before it is stopped.
PULL_IDLE_TIMEOUT: Final = 120.0

# Longer allowance while the server checks the files it downloaded.
PULL_VERIFY_TIMEOUT: Final = 900.0

# Seconds a new download waits for a cancelled one to release the server.
PULL_RELEASE_TIMEOUT: Final = 5.0

# Seconds between progress events sent to the browser for one download.
PULL_EVENT_INTERVAL: Final = 0.25

# Test chat limits: characters in a prompt and in a reply, and seconds.
CHAT_MAX_PROMPT: Final = 4_000
CHAT_MAX_REPLY: Final = 20_000
CHAT_FIRST_TOKEN_TIMEOUT: Final = 120.0
CHAT_IDLE_TIMEOUT: Final = 30.0
CHAT_TOTAL_TIMEOUT: Final = 300.0
CHAT_EVENT_INTERVAL: Final = 0.1
CHAT_RELEASE_TIMEOUT: Final = 5.0

# Most users listed for one model.
MAX_USERS: Final = 50

# Largest answer, in bytes, read from the small version call.
MAX_VERSION_BYTES: Final = 4096
