"""Readable, de-duplicated log lines for camera problems, with credentials masked."""

import logging
import re
import time
from typing import Final

REPEAT_SECONDS: Final = 600

_URL = re.compile(r"(?P<scheme>[A-Za-z][A-Za-z0-9+.\-]*://)(?P<rest>[^\s'\"<>]+)")
_SECRET_KEY = re.compile(
    r"token|key|secret|pass|pwd|auth|sig|credential|code|session|sid", re.IGNORECASE
)


def _mask_query(query: str) -> str:
    parts = []
    for item in query.split("&"):
        name, sep, _value = item.partition("=")
        parts.append(f"{name}=***" if sep and _SECRET_KEY.search(name) else item)
    return "&".join(parts)


def _mask_url(match: re.Match[str]) -> str:
    rest = match.group("rest")
    authority_end = min(
        (i for i in (rest.find("/"), rest.find("?"), rest.find("#")) if i >= 0),
        default=len(rest),
    )
    authority, tail = rest[:authority_end], rest[authority_end:]
    if "@" in authority:
        authority = "***@" + authority.rsplit("@", 1)[1]
    path, qmark, query = tail.partition("?")
    if qmark:
        query, hash_mark, fragment = query.partition("#")
        tail = f"{path}?{_mask_query(query)}{hash_mark}{fragment}"
    return f"{match.group('scheme')}{authority}{tail}"


def mask_secrets(text: str) -> str:
    """Hide user info and secret-looking query values in every URL inside text."""
    return _URL.sub(_mask_url, text)


def source_summary(source: str) -> str:
    """The scheme and host of a stream address, with nothing that could be a secret."""
    masked = mask_secrets(source)
    match = _URL.match(masked)
    if match is None:
        return "unknown source"
    rest = match.group("rest")
    host = re.split(r"[/?#]", rest, maxsplit=1)[0].rsplit("@", 1)[-1]
    return f"{match.group('scheme')}{host}"


class ProblemLog:
    """Logs a problem when it starts or changes, then rarely while it repeats."""

    def __init__(self, logger: logging.Logger, subject: str) -> None:
        """Track one subject, such as a camera recorder."""
        self._logger = logger
        self._subject = subject
        self._message: str | None = None
        self._logged_at = 0.0
        self.attempts = 0

    @property
    def active(self) -> bool:
        """Whether a problem is currently being tracked."""
        return self._message is not None

    def failed(
        self, message: str, now: float | None = None, suffix: str = ""
    ) -> bool:
        """Note a failed attempt. Returns whether a line was written.

        The suffix (such as the retry delay) is shown but never compared.
        """
        now = time.monotonic() if now is None else now
        message = mask_secrets(message)
        self.attempts += 1
        if message != self._message:
            self._message = message
            self._logged_at = now
            self._logger.warning("%s: %s%s", self._subject, message, suffix)
            return True
        if now - self._logged_at >= REPEAT_SECONDS:
            self._logged_at = now
            self._logger.warning(
                "%s: still failing after %d attempts: %s%s",
                self._subject,
                self.attempts,
                message,
                suffix,
            )
            return True
        return False

    def recovered(self, detail: str = "resumed") -> bool:
        """Note a working attempt. Logs once if a problem was open."""
        if self._message is None:
            return False
        self._logger.info(
            "%s %s after %d attempts", self._subject, detail, self.attempts
        )
        self._message = None
        self.attempts = 0
        return True
