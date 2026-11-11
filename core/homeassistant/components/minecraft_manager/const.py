"""Constants for the Minecraft server manager integration."""

from typing import Final

DOMAIN: Final = "minecraft_manager"

STORAGE_KEY: Final = "minecraft_manager.servers"
STORAGE_VERSION: Final = 1

EDITION_JAVA: Final = "java"
EDITION_BEDROCK: Final = "bedrock"
EDITIONS: Final = (EDITION_JAVA, EDITION_BEDROCK)

JAVA_FLAVOURS: Final = ("vanilla", "paper", "purpur", "spigot", "fabric", "forge", "neoforge")
BEDROCK_FLAVOURS: Final = ("vanilla",)
FLAVOURS_BY_EDITION: Final = {
    EDITION_JAVA: JAVA_FLAVOURS,
    EDITION_BEDROCK: BEDROCK_FLAVOURS,
}

TARGET_SSH_DOCKER: Final = "ssh_docker"
TARGET_SUPERVISOR: Final = "supervisor"
TARGET_DOCKER_SOCKET: Final = "docker_socket"
TARGET_LOCAL_PROCESS: Final = "local_process"
TARGET_SSH_PROCESS: Final = "ssh_process"

# Listed in order of preference. The first one is the default.
TARGETS: Final = (
    TARGET_SSH_DOCKER,
    TARGET_SUPERVISOR,
    TARGET_DOCKER_SOCKET,
    TARGET_LOCAL_PROCESS,
    TARGET_SSH_PROCESS,
)

# In this slice a definition is only stored; no process is ever started.
STATE_DEFINED: Final = "defined"

DOCKER_SOCKET_PATH: Final = "/var/run/docker.sock"

NAME_MAX_LENGTH: Final = 48
PORT_MIN: Final = 1024
PORT_MAX: Final = 65535
MEMORY_MIN_MB: Final = 512
MEMORY_MAX_MB: Final = 65536
MAX_SERVERS: Final = 200

# Targets that run on the machine hosting this installation, so they share one
# set of ports. The SSH targets run elsewhere and are checked against each other.
LOCAL_HOST_TARGETS: Final = (
    TARGET_SUPERVISOR,
    TARGET_DOCKER_SOCKET,
    TARGET_LOCAL_PROCESS,
)
# Ports this installation itself listens on, never offered to a server.
RESERVED_LOCAL_PORTS: Final = (8123,)

STORAGE_KEY_HOSTS: Final = "minecraft_manager.hosts"
STORAGE_KEY_VERSIONS: Final = "minecraft_manager.versions"
STORAGE_VERSION_HOSTS: Final = 1
STORAGE_VERSION_VERSIONS: Final = 1

# Private keys live here, under the configuration folder, one file per host.
KEYS_DIRECTORY: Final = "minecraft_manager/keys"
KEY_COMMENT: Final = "home-assistant-minecraft-manager"
MAX_HOSTS: Final = 50

HOST_PORT_MIN: Final = 1
HOST_PORT_MAX: Final = 65535

# The image release every server container uses. The release is explicit and
# fixed here so a person can see it before starting; it is never "latest". The
# Java variant of that release follows the game version (see
# commands.image_for_version), because a game version only starts on the Java
# it was built for.
MINECRAFT_IMAGE_RELEASE: Final = "itzg/minecraft-server:2026.11.0"
MINECRAFT_IMAGE_JAVA25: Final = f"{MINECRAFT_IMAGE_RELEASE}-java25"
MINECRAFT_IMAGE_JAVA21: Final = f"{MINECRAFT_IMAGE_RELEASE}-java21"
MINECRAFT_IMAGE_JAVA17: Final = f"{MINECRAFT_IMAGE_RELEASE}-java17"
MINECRAFT_IMAGE_JAVA8: Final = f"{MINECRAFT_IMAGE_RELEASE}-java8"
# The variant used when a version cannot be read.
MINECRAFT_IMAGE: Final = MINECRAFT_IMAGE_JAVA21
CONTAINER_PREFIX: Final = "mc-"
CONTAINER_GAME_PORT: Final = 25565
STOP_GRACE_SECONDS: Final = 60

# Timeouts, in seconds.
SSH_CONNECT_TIMEOUT: Final = 10
COMMAND_TIMEOUT: Final = 30
PULL_TIMEOUT: Final = 900
RUN_TIMEOUT: Final = 90
STOP_TIMEOUT: Final = 120
REACHABLE_CONNECT_TIMEOUT: Final = 3
REACHABLE_WAIT_SECONDS: Final = 15
REACHABLE_POLL_SECONDS: Final = 2

LOG_LINES_DEFAULT: Final = 100
LOG_LINES_MAX: Final = 500
LOG_MAX_CHARS: Final = 64_000
# Remote output is read in small chunks and never kept beyond this many bytes.
# The log command is also cut on the remote side at LOG_REMOTE_BYTES, so a
# single enormous line never crosses the network. The client cap is a little
# larger so the exit marker that follows the log text still arrives.
LOG_REMOTE_BYTES: Final = 65_536
OUTPUT_MAX_BYTES: Final = LOG_REMOTE_BYTES + 1024
OUTPUT_CHUNK_BYTES: Final = 16_384

# Label that ties a container or a volume to the server that created it.
OWNER_LABEL: Final = "minecraft_manager.server_id"
# Container limits.
CONTAINER_PIDS_LIMIT: Final = 1024
CONTAINER_LOG_MAX_SIZE: Final = "10m"
CONTAINER_LOG_MAX_FILES: Final = "3"

MOJANG_MANIFEST_URL: Final = (
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
)
PAPER_VERSIONS_URL: Final = "https://fill.papermc.io/v3/projects/paper"
VERSION_FETCH_TIMEOUT: Final = 20
VERSION_MAX_BYTES: Final = 4 * 1024 * 1024
VERSION_MAX_ENTRIES: Final = 2000
