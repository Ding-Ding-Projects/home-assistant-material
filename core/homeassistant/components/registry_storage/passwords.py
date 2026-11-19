"""Password rules, enforced in code and not only in the form."""

from dataclasses import dataclass
from enum import StrEnum
import math
import re
from typing import Final

from .crypto import MIN_PASSWORD_LENGTH
from .errors import LockError, Reason

MIN_ENTROPY_BITS: Final = 45.0
STRONG_ENTROPY_BITS: Final = 70.0

_OBVIOUS: Final = (
    "password",
    "passw0rd",
    "qwerty",
    "qwertyuiop",
    "asdfgh",
    "zxcvbn",
    "letmein",
    "welcome",
    "iloveyou",
    "admin",
    "administrator",
    "changeme",
    "homeassistant",
    "home assistant",
    "dragon",
    "monkey",
    "football",
    "baseball",
    "master",
    "login",
    "abc123",
    "trustno1",
    "secret",
    "camera",
    "registry",
)
_SEQUENCES: Final = (
    "abcdefghijklmnopqrstuvwxyz",
    "zyxwvutsrqponmlkjihgfedcba",
    "0123456789",
    "9876543210",
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm",
)


class PasswordProblem(StrEnum):
    """Why a password was not accepted."""

    TOO_SHORT = "too_short"
    OBVIOUS = "obvious"
    REPETITIVE = "repetitive"
    LOW_ENTROPY = "low_entropy"


class PasswordRating(StrEnum):
    """A plain rating for the strength line under the field."""

    TOO_WEAK = "too_weak"
    STRONG_ENOUGH = "strong_enough"
    VERY_STRONG = "very_strong"


@dataclass(frozen=True, slots=True)
class PasswordCheck:
    """The result of looking at a password."""

    length: int
    bits: float
    problem: PasswordProblem | None

    @property
    def acceptable(self) -> bool:
        """Return whether the password may be used."""
        return self.problem is None

    @property
    def rating(self) -> PasswordRating:
        """Return the plain rating."""
        if self.problem is not None:
            return PasswordRating.TOO_WEAK
        if self.bits >= STRONG_ENTROPY_BITS:
            return PasswordRating.VERY_STRONG
        return PasswordRating.STRONG_ENOUGH


def _effective_length(password: str) -> int:
    """Count characters that add something: not repeats, not runs along a sequence."""
    lowered = password.lower()
    counted = 0
    previous = ""
    seen: dict[str, int] = {}
    index = 0
    while index < len(lowered):
        char = lowered[index]
        if char == previous:
            index += 1
            continue
        run = next(
            (
                n
                for n in (4, 3)
                if any(
                    lowered[index : index + n] in seq
                    for seq in _SEQUENCES
                    if index + n <= len(lowered)
                )
            ),
            0,
        )
        if run:
            counted += 1
            index += run
            previous = lowered[index - 1]
            continue
        seen[char] = seen.get(char, 0) + 1
        counted += 1 if seen[char] <= 2 else 0
        previous = char
        index += 1
    return counted


def _pool_size(password: str) -> int:
    pool = 0
    if re.search(r"[a-z]", password):
        pool += 26
    if re.search(r"[A-Z]", password):
        pool += 26
    if re.search(r"[0-9]", password):
        pool += 10
    if re.search(r"[^a-zA-Z0-9]", password):
        pool += 33
    return max(pool, 1)


def _is_obvious(password: str) -> bool:
    letters = re.sub(r"[^a-z]", "", password.lower())
    stripped = re.sub(r"[^a-z0-9 ]", "", password.lower())
    if not letters:
        return True
    for word in _OBVIOUS:
        compact = word.replace(" ", "")
        remainder = letters.replace(compact, "")
        if compact in letters and len(remainder) <= 2:
            return True
        if stripped.replace(" ", "") == compact:
            return True
    return False


def check_password(password: str) -> PasswordCheck:
    """Look at a password: length, obvious choices, repeats and a conservative estimate."""
    length = len(password)
    effective = _effective_length(password)
    # Human-chosen text is far less random than random characters, so count half.
    bits = effective * math.log2(_pool_size(password)) * 0.5
    problem: PasswordProblem | None = None
    if length < MIN_PASSWORD_LENGTH:
        problem = PasswordProblem.TOO_SHORT
    elif _is_obvious(password):
        problem = PasswordProblem.OBVIOUS
    elif effective < MIN_PASSWORD_LENGTH * 0.6:
        problem = PasswordProblem.REPETITIVE
    elif bits < MIN_ENTROPY_BITS:
        problem = PasswordProblem.LOW_ENTROPY
    return PasswordCheck(length, round(bits, 1), problem)


def require_password(password: str, confirmation: str) -> None:
    """Raise when the password is weak or the confirmation differs."""
    if password != confirmation:
        raise LockError(Reason.PASSWORD_MISMATCH)
    if not check_password(password).acceptable:
        raise LockError(Reason.PASSWORD_TOO_WEAK)
