"""Build the Docker commands that run on the remote host.

Pure functions only. Every command is an argument list. Each value that ends up
in a command is validated here again, even though the websocket layer already
did, so a hostile value can never reach a shell: the builders refuse it before
a command exists. The caller joins the list with ``shlex.join``.
"""

import ipaddress
import re
from typing import Any

from .const import (
    CONTAINER_GAME_PORT,
    CONTAINER_PREFIX,
    EDITION_JAVA,
    LOG_LINES_MAX,
    MEMORY_MAX_MB,
    MEMORY_MIN_MB,
    MINECRAFT_IMAGE,
    MINECRAFT_IMAGE_JAVA8,
    MINECRAFT_IMAGE_JAVA17,
    MINECRAFT_IMAGE_JAVA21,
    MINECRAFT_IMAGE_JAVA25,
    CONTAINER_LOG_MAX_FILES,
    CONTAINER_LOG_MAX_SIZE,
    CONTAINER_PIDS_LIMIT,
    NAME_MAX_LENGTH,
    OWNER_LABEL,
    PORT_MAX,
    PORT_MIN,
    STOP_GRACE_SECONDS,
)
from .host_validation import is_lan_address
from .validation import IDENTIFIER_PATTERN, NAME_PATTERN, VERSION_PATTERN

# The value of the TYPE variable of the server image for each flavour.
IMAGE_TYPES: dict[str, str] = {
    "vanilla": "VANILLA",
    "paper": "PAPER",
    "purpur": "PURPUR",
    "spigot": "SPIGOT",
    "fabric": "FABRIC",
    "forge": "FORGE",
    "neoforge": "NEOFORGE",
}

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")
_NAME_ERRORS = ("invalid_name",)


class CommandError(Exception):
    """A value was refused before any command was built."""

    def __init__(self, code: str) -> None:
        """Keep the stable error code."""
        super().__init__(code)
        self.code = code


def slug(name: str) -> str:
    """Return the lowercase, dash separated form of a server name.

    The result is at most 40 characters of ``a-z``, ``0-9`` and single dashes.
    """
    if (
        not isinstance(name, str)
        or len(name) > NAME_MAX_LENGTH
        or not NAME_PATTERN.fullmatch(name)
    ):
        raise CommandError("invalid_name")
    result = _SLUG_STRIP.sub("-", name.lower()).strip("-")[:40].strip("-")
    if not result:
        raise CommandError("invalid_name")
    return result


def container_name(name: str) -> str:
    """Return the container name for a server."""
    return f"{CONTAINER_PREFIX}{slug(name)}"


def volume_name(name: str) -> str:
    """Return the name of the Docker volume holding a server's data."""
    return f"{CONTAINER_PREFIX}{slug(name)}-data"


def docker_version() -> list[str]:
    """Ask the Docker engine for its version."""
    return ["docker", "version", "--format", "{{.Server.Version}}"]


_RELEASE_VERSION = re.compile(r"^(\d+)\.(\d+)(?:\.(\d+))?")
_WEEKLY_SNAPSHOT = re.compile(r"^(\d\d)w\d\d")


def image_for_version(version: object) -> str:
    """Return the pinned image whose Java suits a game version.

    Minecraft 26.1 and newer need Java 25, 1.20.5 to 1.21.x need Java 21,
    1.17 to 1.20.4 run on Java 17 and older versions on Java 8. The word
    "latest" means the newest release. A version that cannot be read gets the
    Java 21 variant.
    """
    if not isinstance(version, str):
        return MINECRAFT_IMAGE
    if version == "latest":
        return MINECRAFT_IMAGE_JAVA25
    if match := _RELEASE_VERSION.match(version):
        major, minor = int(match[1]), int(match[2])
        patch = int(match[3] or 0)
        if major >= 2:
            return MINECRAFT_IMAGE_JAVA25
        if minor >= 21 or (minor == 20 and patch >= 5):
            return MINECRAFT_IMAGE_JAVA21
        if minor >= 17:
            return MINECRAFT_IMAGE_JAVA17
        return MINECRAFT_IMAGE_JAVA8
    if match := _WEEKLY_SNAPSHOT.match(version):
        year = int(match[1])
        if year >= 26:
            return MINECRAFT_IMAGE_JAVA25
        if year >= 24:
            return MINECRAFT_IMAGE_JAVA21
        if year >= 21:
            return MINECRAFT_IMAGE_JAVA17
        return MINECRAFT_IMAGE_JAVA8
    return MINECRAFT_IMAGE


def image_inspect(image: str = MINECRAFT_IMAGE) -> list[str]:
    """Check that a pinned image is already on the host."""
    return ["docker", "image", "inspect", "--format", "{{.Id}}", image]


def image_pull(image: str = MINECRAFT_IMAGE) -> list[str]:
    """Pull a pinned image."""
    return ["docker", "pull", image]


def inspect(name: str) -> list[str]:
    """Read the state of a server container."""
    return [
        "docker",
        "inspect",
        "--type",
        "container",
        "--format",
        "{{.State.Status}}|{{.State.StartedAt}}"
        "|{{if .State.Health}}{{.State.Health.Status}}{{end}}"
        '|{{index .Config.Labels "' + OWNER_LABEL + '"}}',
        container_name(name),
    ]


def start_existing(name: str) -> list[str]:
    """Start a container that already exists."""
    return ["docker", "start", container_name(name)]


def stop(name: str) -> list[str]:
    """Stop a container, giving the game time to save the world."""
    return ["docker", "stop", "-t", str(STOP_GRACE_SECONDS), container_name(name)]


def restart(name: str) -> list[str]:
    """Restart a container."""
    return ["docker", "restart", "-t", str(STOP_GRACE_SECONDS), container_name(name)]


def remove_container(name: str) -> list[str]:
    """Remove a stopped container. The data volume is kept."""
    return ["docker", "rm", container_name(name)]


def remove_volume(name: str) -> list[str]:
    """Remove the data volume of a server."""
    return ["docker", "volume", "rm", volume_name(name)]


def volume_inspect(name: str) -> list[str]:
    """Read the owner label of the data volume of a server."""
    return [
        "docker",
        "volume",
        "inspect",
        "--format",
        '{{index .Labels "' + OWNER_LABEL + '"}}',
        volume_name(name),
    ]


def volume_create(name: str, server_id: str) -> list[str]:
    """Create the data volume, labelled with the server that owns it."""
    if not isinstance(server_id, str) or not IDENTIFIER_PATTERN.fullmatch(server_id):
        raise CommandError("invalid_id")
    return [
        "docker",
        "volume",
        "create",
        "--label",
        f"{OWNER_LABEL}={server_id}",
        volume_name(name),
    ]


def logs(name: str, lines: int) -> list[str]:
    """Read the last lines of the container log."""
    if not isinstance(lines, int) or isinstance(lines, bool):
        raise CommandError("invalid_lines")
    if not 1 <= lines <= LOG_LINES_MAX:
        raise CommandError("invalid_lines")
    return ["docker", "logs", "--tail", str(lines), container_name(name)]


def memory_limit_mb(memory_mb: int) -> int:
    """Return the container memory limit for a given game memory.

    The game's own heap is ``memory_mb``. The container limit adds headroom
    for the Java runtime itself, so the kernel does not stop the container
    while the heap is still inside its budget.
    """
    return memory_mb + max(512, memory_mb // 4)


def _bind_address(bind_ip: str) -> str:
    if not is_lan_address(bind_ip):
        raise CommandError("invalid_address")
    address = ipaddress.ip_address(bind_ip)
    return f"[{address}]" if address.version == 6 else str(address)


def run(server: dict[str, Any], bind_ip: str) -> list[str]:
    """Create and start the container of a Java server.

    The game port is published on ``bind_ip`` only, never on every interface.
    """
    name = server.get("name")
    container = container_name(name)  # type: ignore[arg-type]
    volume = volume_name(name)  # type: ignore[arg-type]

    server_id = server.get("id")
    if not isinstance(server_id, str) or not IDENTIFIER_PATTERN.fullmatch(server_id):
        raise CommandError("invalid_id")
    if server.get("edition") != EDITION_JAVA:
        raise CommandError("edition_not_supported")
    image_type = IMAGE_TYPES.get(server.get("flavour"))  # type: ignore[arg-type]
    if image_type is None:
        raise CommandError("invalid_flavour")
    version = server.get("version")
    if not isinstance(version, str) or not VERSION_PATTERN.fullmatch(version):
        raise CommandError("invalid_version")
    port = server.get("port")
    if (
        not isinstance(port, int)
        or isinstance(port, bool)
        or not PORT_MIN <= port <= PORT_MAX
    ):
        raise CommandError("invalid_port")
    memory = server.get("memory_mb")
    if (
        not isinstance(memory, int)
        or isinstance(memory, bool)
        or not MEMORY_MIN_MB <= memory <= MEMORY_MAX_MB
    ):
        raise CommandError("invalid_memory")

    command = [
        "docker",
        "run",
        "--detach",
        "--name",
        container,
        "--restart",
        "unless-stopped",
        "--stop-timeout",
        str(STOP_GRACE_SECONDS),
        "--memory",
        f"{memory_limit_mb(memory)}m",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        str(CONTAINER_PIDS_LIMIT),
        "--log-driver",
        "json-file",
        "--log-opt",
        f"max-size={CONTAINER_LOG_MAX_SIZE}",
        "--log-opt",
        f"max-file={CONTAINER_LOG_MAX_FILES}",
        "--label",
        f"{OWNER_LABEL}={server_id}",
        "--publish",
        f"{_bind_address(bind_ip)}:{port}:{CONTAINER_GAME_PORT}/tcp",
        "--volume",
        f"{volume}:/data",
        "--env",
        "EULA=TRUE",
        "--env",
        f"TYPE={image_type}",
        "--env",
        f"MEMORY={memory}M",
    ]
    if version != "latest":
        command += ["--env", f"VERSION={version}"]
    command.append(image_for_version(version))
    return command


def classify_failure(exit_status: int | None, stderr: str) -> str:
    """Map a failed Docker command to a stable code.

    The text itself is never returned: it can hold paths or addresses beyond
    what the person entered.
    """
    text = (stderr or "").lower()
    if exit_status == 127 or "command not found" in text:
        return "docker_missing"
    if "permission denied" in text:
        return "docker_permission"
    if "cannot connect to the docker daemon" in text or "is the docker daemon" in text:
        return "docker_not_running"
    if "no such container" in text or "no such object" in text:
        return "container_not_found"
    if "no such volume" in text:
        return "volume_not_found"
    if "volume is in use" in text:
        return "volume_in_use"
    if "is already in use" in text or "conflict" in text:
        return "container_exists"
    if "port is already allocated" in text or "address already in use" in text:
        return "port_in_use"
    if "cannot assign requested address" in text:
        return "bind_failed"
    return "command_failed"
