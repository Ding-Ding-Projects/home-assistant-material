"""Readable, de-duplicated log lines for camera problems, with credentials masked."""

import logging
import re
import time
from typing import Final

REPEAT_SECONDS: Final = 600
# While one problem goes on, the reminder gets rarer: 10 minutes, 1 hour, then 6 hours.
REPEAT_STEPS: Final = (REPEAT_SECONDS, 3600, 21600)

_URL = re.compile(r"(?P<scheme>[A-Za-z][A-Za-z0-9+.\-]*://)(?P<rest>[^\s<>]+)")
_USERINFO = re.compile(
    r"^(?P<user>.+)@(?P<host>(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._\-]+)(?::\d+)?)"
    r"(?=[/?#:]|$)"
)
# Values worth showing in a query: they only choose a channel or a stream.
_SAFE_QUERY_NAMES = frozenset({"channel", "subtype", "stream", "profile", "type"})
_PATH_SECRET = re.compile(
    r"(?i)(?<![A-Za-z0-9])(pass(?:word)?|pwd|passwd|user(?:name)?|usr|token|key|auth)=[^&_;/?#\s]*"
)
_ADDRESS_PREFIX = re.compile(r"\[[^\]]*@ 0x[0-9A-Fa-f]+\]\s*|@ 0x[0-9A-Fa-f]+")
_DIGITS = re.compile(r"\d+")


def _mask_query(query: str) -> str:
    parts = []
    for item in query.split("&"):
        name, sep, _value = item.partition("=")
        keep = not sep or name.lower() in _SAFE_QUERY_NAMES
        parts.append(item if keep else f"{name}=***")
    return "&".join(parts)


def _without_user_info(rest: str) -> tuple[str, bool]:
    """The text after the user info, and whether there was any."""
    match = _USERINFO.match(rest)
    if match is None:
        return rest, False
    return rest[match.start("host") :], True


def _mask_url(match: re.Match[str]) -> str:
    rest, had_user = _without_user_info(match.group("rest"))
    rest, hash_mark, _fragment = rest.partition("#")
    path, qmark, query = rest.partition("?")
    path = _PATH_SECRET.sub(lambda m: f"{m.group(1)}=***", path)
    masked_query = f"?{_mask_query(query)}" if qmark else ""
    masked_fragment = "#***" if hash_mark else ""
    return (
        f"{match.group('scheme')}{'***@' if had_user else ''}"
        f"{path}{masked_query}{masked_fragment}"
    )


def mask_secrets(text: str) -> str:
    """Hide user info and secret-looking parts of every URL inside text."""
    return _URL.sub(_mask_url, text)


def source_summary(source: str) -> str:
    """The scheme and host of a stream address, with nothing that could be a secret."""
    match = _URL.match(source)
    if match is None:
        return "unknown source"
    rest, _had_user = _without_user_info(match.group("rest"))
    host = re.split(r"[/?#]", rest, maxsplit=1)[0]
    return f"{match.group('scheme')}{host}"


def comparison_key(message: str) -> str:
    """The message without the parts that change on every run of the same failure."""
    return _DIGITS.sub("#", _ADDRESS_PREFIX.sub("", message))


class ProblemLog:
    """Logs a problem when it starts or changes, then rarely while it repeats."""

    def __init__(self, logger: logging.Logger, subject: str) -> None:
        """Track one subject, such as a camera recorder."""
        self._logger = logger
        self._subject = subject
        self._key: str | None = None
        self._logged_at = 0.0
        self._repeats = 0
        self.attempts = 0

    @property
    def active(self) -> bool:
        """Whether a problem is currently being tracked."""
        return self._key is not None

    def failed(
        self,
        message: str,
        now: float | None = None,
        suffix: str = "",
        detail: str = "",
        key: str | None = None,
    ) -> bool:
        """Note a failed attempt. Returns whether a line was written.

        The suffix (such as the retry delay) is shown but never compared. The
        detail (extra lines) is written only when the problem is new or changed.
        Messages are compared by key, which defaults to the message without
        process addresses.
        """
        now = time.monotonic() if now is None else now
        message = mask_secrets(message)
        compare = key if key is not None else _ADDRESS_PREFIX.sub("", message)
        self.attempts += 1
        if compare != self._key:
            self._key = compare
            self._logged_at = now
            self._repeats = 0
            self._logger.warning(
                "%s: %s%s%s",
                self._subject,
                message,
                suffix,
                "\n" + mask_secrets(detail) if detail else "",
            )
            return True
        wait = REPEAT_STEPS[min(self._repeats, len(REPEAT_STEPS) - 1)]
        if now - self._logged_at >= wait:
            self._logged_at = now
            self._repeats += 1
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
        if self._key is None:
            return False
        self._logger.info(
            "%s %s after %d attempts", self._subject, detail, self.attempts
        )
        self._key = None
        self._repeats = 0
        self.attempts = 0
        return True
