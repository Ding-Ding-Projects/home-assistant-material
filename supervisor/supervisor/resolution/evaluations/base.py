"""Baseclass for system evaluations."""

from abc import ABC, abstractmethod
import logging
import os

from ...const import CoreState
from ...coresys import CoreSys, CoreSysAttributes
from ..const import (
    CONTAINER_HOST_EXPECTED_REASONS,
    ENV_CONTAINER_HOST,
    UnsupportedReason,
)

_LOGGER: logging.Logger = logging.getLogger(__name__)


class EvaluateBase(ABC, CoreSysAttributes):
    """Baseclass for evaluation."""

    def __init__(self, coresys: CoreSys) -> None:
        """Initialize the evaluation class."""
        self.coresys = coresys

    async def __call__(self) -> None:
        """Execute the evaluation."""
        if self.sys_core.state not in self.states:
            return
        if self.expected_missing_on_container_host:
            return
        if await self.evaluate():
            if self.reason not in self.sys_resolution.unsupported:
                self.sys_resolution.add_unsupported_reason(self.reason)
                _LOGGER.warning(
                    "%s (more-info: https://www.home-assistant.io/more-info/unsupported/%s)",
                    self.on_failure,
                    self.reason,
                )
        elif self.reason in self.sys_resolution.unsupported:
            _LOGGER.info("Clearing %s as reason for unsupported", self.reason)
            self.sys_resolution.dismiss_unsupported(self.reason)

    @property
    def expected_missing_on_container_host(self) -> bool:
        """Return true when this reason is expected in the full hosting mode.

        In that mode the Supervisor runs in a container with its own Docker engine and no
        operating system under it, so the evaluations that only report the absence of an
        operating system (see CONTAINER_HOST_EXPECTED_REASONS) are not run.
        """
        return (
            os.environ.get(ENV_CONTAINER_HOST) == "1"
            and self.reason in CONTAINER_HOST_EXPECTED_REASONS
        )

    @abstractmethod
    async def evaluate(self) -> bool:
        """Run evaluation, return true if system fails."""

    @property
    @abstractmethod
    def reason(self) -> UnsupportedReason:
        """Return a UnsupportedReason enum."""

    @property
    def slug(self) -> str:
        """Return the check slug."""
        return self.__class__.__module__.rsplit(".", maxsplit=1)[-1]

    @property
    @abstractmethod
    def on_failure(self) -> str:
        """Return a string that is printed when system fails this evaluation."""

    @property
    def states(self) -> list[CoreState]:
        """Return a list of valid states when this evaluation can run."""
        return []
