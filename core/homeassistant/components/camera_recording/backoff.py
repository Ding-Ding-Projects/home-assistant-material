"""Waits that grow, so nothing asks a camera service again and again."""

from collections.abc import Sequence

RATE_LIMIT_WORDS = (
    "429",
    "resource_exhausted",
    "too many requests",
    "rate limit",
    "rate-limit",
    "ratelimit",
    "quota",
)


def is_rate_limited(text: str | None) -> bool:
    """Whether an error says the service is limiting how often it can be asked."""
    if not text:
        return False
    lowered = text.lower()
    return any(word in lowered for word in RATE_LIMIT_WORDS)


def wait_for_attempt(attempt: int, schedule: Sequence[float]) -> float:
    """The wait before attempt number `attempt` (0 for the first), capped at the last step."""
    return schedule[min(max(attempt, 0), len(schedule) - 1)]
