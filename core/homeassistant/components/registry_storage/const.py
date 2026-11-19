"""Constants for the Container registry storage integration."""

from collections.abc import Callable
from enum import StrEnum
from typing import Final

from homeassistant.util.hass_dict import HassKey

DOMAIN: Final = "registry_storage"

DATA_BACKUP_AGENT_LISTENERS: HassKey[list[Callable[[], None]]] = HassKey(
    f"{DOMAIN}.backup_agent_listeners"
)

# Config entry data keys.
CONF_REGISTRY: Final = "registry"
CONF_ADDRESS: Final = "address"
CONF_USERNAME: Final = "username"
CONF_TOKEN: Final = "token"
CONF_REPOSITORY: Final = "repository"
CONF_KEY_REF: Final = "key_ref"
CONF_PASSWORD: Final = "password"
CONF_PASSWORD_CONFIRMATION: Final = "password_confirmation"
CONF_UNDERSTAND: Final = "understand"
CONF_CAMERA_REPOSITORIES: Final = "camera_repositories"
CONF_BACKUPS_REPOSITORY: Final = "backups_repository"
CONF_CAMERA: Final = "camera"
CONF_OLD_PASSWORD: Final = "old_password"

STORAGE_VERSION: Final = 1
STORAGE_KEY_PREFIX: Final = "registry_storage"

DEFAULT_REGISTRY_TIMEOUT: Final = 60.0
USER_AGENT: Final = "home-assistant-registry-storage/1"


class RegistryKind(StrEnum):
    """The registries the guided setup knows by name."""

    DOCKER_HUB = "docker_hub"
    GITHUB = "github"
    OTHER = "other"


REGISTRY_ADDRESSES: Final[dict[RegistryKind, str]] = {
    RegistryKind.DOCKER_HUB: "https://registry-1.docker.io",
    RegistryKind.GITHUB: "https://ghcr.io",
}

# Where the owner makes an access token, shown in the guided sign-in.
TOKEN_PAGES: Final[dict[RegistryKind, str]] = {
    RegistryKind.DOCKER_HUB: "https://app.docker.com/settings/personal-access-tokens",
    RegistryKind.GITHUB: "https://github.com/settings/tokens/new?scopes=write:packages,read:packages",
}

# Reserved tag names inside a repository. Every other tag is a stored object.
LOCK_TAG: Final = "lock"
