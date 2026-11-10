"""Error capture hooks that do nothing.

This build never sends crash reports, exceptions or messages to any server.
The functions remain only so that the many call sites keep working; each one
returns immediately without recording or transmitting anything.
"""

from typing import Literal

from ..coresys import CoreSys


def init_sentry(coresys: CoreSys) -> None:
    """Do nothing. No error reporting client is ever created."""


def capture_exception(err: BaseException) -> None:
    """Do nothing. The exception is not sent anywhere."""


async def async_capture_exception(err: BaseException) -> None:
    """Do nothing. The exception is not sent anywhere."""


async def async_capture_message(
    msg: str,
    level: Literal["fatal", "critical", "error", "warning", "info", "debug"]
    | None = "warning",
) -> None:
    """Do nothing. The message is not sent anywhere."""


def fire_and_forget_capture_message(
    msg: str,
    level: Literal["fatal", "critical", "error", "warning", "info", "debug"]
    | None = "warning",
) -> None:
    """Do nothing. The message is not sent anywhere."""


def close_sentry() -> None:
    """Do nothing. There is no client to close."""
