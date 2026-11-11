"""Detect which hosting targets are possible on this installation."""

from dataclasses import dataclass
import os
import shutil

from homeassistant.core import HomeAssistant
from homeassistant.helpers.hassio import is_hassio

from .const import (
    DOCKER_SOCKET_PATH,
    TARGET_DOCKER_SOCKET,
    TARGET_LOCAL_PROCESS,
    TARGET_SSH_DOCKER,
    TARGET_SSH_PROCESS,
    TARGET_SUPERVISOR,
    TARGETS,
)


@dataclass(frozen=True)
class TargetStatus:
    """Whether one target can be used, and why."""

    id: str
    available: bool
    # A stable code the interface turns into a sentence.
    reason: str

    def as_dict(self) -> dict[str, str | bool]:
        """Return the status as a plain dictionary."""
        return {"id": self.id, "available": self.available, "reason": self.reason}


def _detect_socket() -> TargetStatus:
    if not os.path.exists(DOCKER_SOCKET_PATH):
        return TargetStatus(TARGET_DOCKER_SOCKET, False, "socket_not_mounted")
    if not os.access(DOCKER_SOCKET_PATH, os.R_OK | os.W_OK):
        return TargetStatus(TARGET_DOCKER_SOCKET, False, "socket_not_accessible")
    return TargetStatus(TARGET_DOCKER_SOCKET, True, "socket_present")


def _detect_java() -> TargetStatus:
    if shutil.which("java") is None:
        return TargetStatus(TARGET_LOCAL_PROCESS, False, "java_missing")
    return TargetStatus(TARGET_LOCAL_PROCESS, True, "java_present")


def detect_blocking(supervisor: bool) -> list[TargetStatus]:
    """Detect every target. Blocking: touches the file system and PATH.

    The result keeps the order of preference. SSH targets are always possible
    to define; the credentials are only needed when a server is started.
    """
    by_id = {
        TARGET_SSH_DOCKER: TargetStatus(TARGET_SSH_DOCKER, True, "ssh_always"),
        TARGET_SUPERVISOR: TargetStatus(
            TARGET_SUPERVISOR,
            supervisor,
            "supervisor_present" if supervisor else "supervisor_missing",
        ),
        TARGET_DOCKER_SOCKET: _detect_socket(),
        TARGET_LOCAL_PROCESS: _detect_java(),
        TARGET_SSH_PROCESS: TargetStatus(TARGET_SSH_PROCESS, True, "ssh_always"),
    }
    return [by_id[target] for target in TARGETS]


async def async_detect_targets(hass: HomeAssistant) -> list[TargetStatus]:
    """Detect the targets without blocking the event loop."""
    supervisor = is_hassio(hass)
    return await hass.async_add_executor_job(detect_blocking, supervisor)
