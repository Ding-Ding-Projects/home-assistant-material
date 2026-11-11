"""One waiting commit per dashboard.

Every save of a dashboard asks for a commit. Commits run one at a time, and the
commit reads the newest saved configuration when its turn comes, so while one
waits, further requests for the same dashboard add nothing. A request that
arrives while a commit is running queues exactly one more.
"""

import asyncio
from collections.abc import Awaitable, Callable
import logging

_LOGGER = logging.getLogger(__name__)


class SnapshotQueue:
    """Run commits one at a time and merge the requests that wait."""

    def __init__(self) -> None:
        """Start with nothing waiting."""
        self.lock = asyncio.Lock()
        self._pending: set[str] = set()

    @property
    def pending(self) -> frozenset[str]:
        """Return the dashboards that have a commit waiting."""
        return frozenset(self._pending)

    def discard(self, key: str) -> None:
        """Drop the commit waiting for a dashboard."""
        self._pending.discard(key)

    async def run(self, key: str, action: Callable[[], Awaitable[None]]) -> None:
        """Run `action` once for every burst of requests for `key`.

        Nothing is raised: a failure of the action is logged.
        """
        if key in self._pending:
            return
        self._pending.add(key)
        waiting = True
        try:
            async with self.lock:
                if key not in self._pending:
                    return
                self._pending.discard(key)
                waiting = False
                await action()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("The commit of dashboard %s failed", key)
        finally:
            if waiting:
                self._pending.discard(key)
