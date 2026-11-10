"""Constants for the Guided setup integration."""

from typing import Final

DOMAIN: Final = "guided_setup"

STORAGE_KEY: Final = "guided_setup.entries"
STORAGE_VERSION: Final = 1

# Directory below the configuration directory that holds the generated files.
# The configuration loader merges every file in it as a package.
FILES_DIRECTORY: Final = "guided_setup"

DOCUMENTATION_URL: Final = "https://www.home-assistant.io/integrations/{domain}"

# Integration types that never need a hand-written configuration.
EXCLUDED_INTEGRATION_TYPES: Final = frozenset({"virtual", "entity", "system", "helper"})

# Names of the managed entity platform key, used when a platform is configured
# below an entity domain such as `sensor`.
CONF_PLATFORM_KEY: Final = "platform"
