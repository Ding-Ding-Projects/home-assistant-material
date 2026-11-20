"""Constants for exporting and importing integrations."""

from typing import Final

DOMAIN: Final = "integration_transfer"

LIST_KIND: Final = "home-assistant-material/integrations-list"
SETTINGS_KIND: Final = "home-assistant-material/integration-settings"
FILE_FORMAT: Final = 1

# A file larger than this is refused whole, both in the interface and here.
MAX_FILE_BYTES: Final = 1024 * 1024

# How many domains one comparison may ask about.
MAX_COMPARE_DOMAINS: Final = 2000

UNDO_STORAGE_KEY: Final = "integration_transfer.undo"
UNDO_STORAGE_VERSION: Final = 1

DATA_UNDO: Final = "integration_transfer_undo"
