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
