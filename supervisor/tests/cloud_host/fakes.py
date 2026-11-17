"""Fakes for the cloud host tests."""

from supervisor.cloud_host.runner import TunnelRunner
from supervisor.exceptions import CloudHostRunnerError

SIGN_IN_URL = "https://login.example.net/cert?token=abc"


class FakeRunner(TunnelRunner):
    """Runner that records calls and can be made to fail."""

    def __init__(self) -> None:
        """Initialize."""
        self.signed_in = False
        self.running = False
        self.removed = False
        self.fail_on: set[str] = set()

    def _maybe_fail(self, name: str) -> None:
        if name in self.fail_on:
            raise CloudHostRunnerError(f"{name} failed")

    async def begin_sign_in(self, hostname: str) -> str:
        """Return a fixed sign-in URL."""
        self._maybe_fail("begin_sign_in")
        return SIGN_IN_URL

    async def sign_in_complete(self) -> bool:
        """Return whether sign-in was finished."""
        self._maybe_fail("sign_in_complete")
        return self.signed_in

    async def start(self, hostname: str) -> None:
        """Mark running."""
        self._maybe_fail("start")
        self.running = True

    async def stop(self) -> None:
        """Mark stopped."""
        self._maybe_fail("stop")
        self.running = False

    async def is_running(self) -> bool:
        """Return running."""
        return self.running

    async def remove(self) -> None:
        """Mark removed."""
        self._maybe_fail("remove")
        self.running = False
        self.signed_in = False
        self.removed = True
