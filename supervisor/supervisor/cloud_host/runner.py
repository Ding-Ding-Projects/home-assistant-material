"""Tunnel runner interface for the cloud host."""

from abc import ABC, abstractmethod

from ..exceptions import CloudHostRunnerError
from .const import RUNNER_NOT_INSTALLED


class TunnelRunner(ABC):
    """Runs the tunnel client. The credential never leaves the client's own data volume."""

    @abstractmethod
    async def begin_sign_in(self, hostname: str) -> str:
        """Start the client's sign-in flow and return only the URL it prints."""

    @abstractmethod
    async def sign_in_complete(self) -> bool:
        """Return True once the client holds a credential."""

    @abstractmethod
    async def start(self, hostname: str) -> None:
        """Start serving the hostname."""

    @abstractmethod
    async def stop(self) -> None:
        """Stop serving, keeping the credential."""

    @abstractmethod
    async def is_running(self) -> bool:
        """Return True when the client is serving."""

    @abstractmethod
    async def remove(self) -> str | None:
        """Stop and delete the client and its credential, returning a note on leftovers."""

    async def trusted_proxy(self) -> str | None:
        """Return the address Core must trust, when the runner knows it."""
        return None


class NotInstalledTunnelRunner(TunnelRunner):
    """Placeholder until the real tunnel client can be started from the Supervisor."""

    async def begin_sign_in(self, hostname: str) -> str:
        """Report that no runner exists."""
        raise CloudHostRunnerError(RUNNER_NOT_INSTALLED)

    async def sign_in_complete(self) -> bool:
        """Report that no runner exists."""
        raise CloudHostRunnerError(RUNNER_NOT_INSTALLED)

    async def start(self, hostname: str) -> None:
        """Report that no runner exists."""
        raise CloudHostRunnerError(RUNNER_NOT_INSTALLED)

    async def stop(self) -> None:
        """Report that no runner exists."""
        raise CloudHostRunnerError(RUNNER_NOT_INSTALLED)

    async def is_running(self) -> bool:
        """Report that no runner exists."""
        raise CloudHostRunnerError(RUNNER_NOT_INSTALLED)

    async def remove(self) -> str | None:
        """Nothing was ever installed, so nothing needs removing."""
        return None
