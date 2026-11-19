"""Rules for moving Home Assistant Core to an older version.

Going back to an older version always makes a backup first. The only way past
that backup is a pass issued here: it works once, for one version, for one
holder, and only for a few minutes.
"""

from dataclasses import dataclass
import secrets

from awesomeversion import AwesomeVersion, AwesomeVersionException

from .const import LANDINGPAGE

SKIP_PASS_LIFETIME_SECONDS = 300
SKIP_PASS_LIMIT = 8

# How long going back waits for a backup that was already running.
WAIT_FOR_RUNNING_BACKUP_SECONDS = 2 * 60 * 60
WAIT_POLL_SECONDS = 2
# How often a backup is attempted again when another one started first.
BACKUP_START_ATTEMPTS = 3

REASON_FAILED = "failed"
REASON_TIMED_OUT = "timed_out"
REASON_CHECK_FAILED = "check_failed"
REASON_STOPPED = "stopped"

STAGE_WAITING = "waiting_for_backup"
STAGE_BACKING_UP = "backing_up"
STAGE_CHECKING = "checking"
STAGE_DONE = "backup_checked"
STAGE_SKIPPED = "backup_skipped"
STAGE_INSTALLING = "installing"
STAGE_FAILED = "failed"


def is_downgrade(
    current: AwesomeVersion | str | None, target: AwesomeVersion | str | None
) -> bool:
    """Return True when ``target`` is older than ``current``.

    Versions that cannot be compared count as going back, so the backup is
    made rather than skipped. Without an installed version, or from the
    landing page, there is nothing to go back from.
    """
    if not current or not target or str(current) == str(LANDINGPAGE):
        return False
    current_version = AwesomeVersion(str(current))
    target_version = AwesomeVersion(str(target))
    if current_version == target_version:
        return False
    try:
        return target_version < current_version
    except AwesomeVersionException:
        return True


@dataclass(slots=True)
class _SkipPass:
    version: str
    holder: str
    expires: float


class DowngradeSkipPasses:
    """Single-use passes that allow going back once without a backup."""

    def __init__(self) -> None:
        """Initialize the store."""
        self._passes: dict[str, _SkipPass] = {}

    def issue(self, version: str, holder: str, now: float) -> str:
        """Issue a pass for ``version`` that only ``holder`` can use."""
        self._prune(now)
        while len(self._passes) >= SKIP_PASS_LIMIT:
            oldest = min(self._passes, key=lambda key: self._passes[key].expires)
            del self._passes[oldest]
        token = secrets.token_urlsafe(32)
        self._passes[token] = _SkipPass(
            version=str(version),
            holder=holder,
            expires=now + SKIP_PASS_LIFETIME_SECONDS,
        )
        return token

    def consume(self, token: str, version: str, holder: str, now: float) -> bool:
        """Use a pass. Any presented pass is spent, valid or not."""
        self._prune(now)
        skip_pass = self._passes.pop(token, None)
        if skip_pass is None:
            return False
        return (
            secrets.compare_digest(skip_pass.version, str(version))
            and secrets.compare_digest(skip_pass.holder, holder)
            and now <= skip_pass.expires
        )

    def __len__(self) -> int:
        """Return the number of passes that are kept."""
        return len(self._passes)

    def _prune(self, now: float) -> None:
        for token in [
            token for token, skip in self._passes.items() if skip.expires < now
        ]:
            del self._passes[token]
