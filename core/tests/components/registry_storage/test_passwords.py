"""Tests for the password rules."""

import pytest

from homeassistant.components.registry_storage.errors import LockError, Reason
from homeassistant.components.registry_storage.passwords import (
    PasswordProblem,
    PasswordRating,
    check_password,
    require_password,
)


@pytest.mark.parametrize(
    ("password", "problem"),
    [
        ("short", PasswordProblem.TOO_SHORT),
        ("1234567890123", PasswordProblem.TOO_SHORT),
        ("passwordpassword", PasswordProblem.OBVIOUS),
        ("Password123456789", PasswordProblem.OBVIOUS),
        ("qwertyuiopqwerty", PasswordProblem.REPETITIVE),
        ("homeassistant", PasswordProblem.TOO_SHORT),
        ("12345678901234567890", PasswordProblem.OBVIOUS),
        ("aaaaaaaaaaaaaaaaaaaa", PasswordProblem.REPETITIVE),
        ("abababababababab", PasswordProblem.REPETITIVE),
        ("abcdefghijklmnopqrst", PasswordProblem.REPETITIVE),
    ],
)
def test_rejected(password: str, problem: PasswordProblem) -> None:
    """Short, obvious, repetitive and sequence passwords are not accepted."""
    result = check_password(password)
    assert result.problem is problem
    assert not result.acceptable
    assert result.rating is PasswordRating.TOO_WEAK


@pytest.mark.parametrize(
    "password",
    [
        "a few unrelated words 42",
        "correct horse battery staple",
        "T7#kd9!QmZ2$vL8x",
        "lemon river quiet bicycle",
    ],
)
def test_accepted(password: str) -> None:
    """Long, varied passwords are accepted."""
    result = check_password(password)
    assert result.problem is None
    assert result.acceptable
    assert result.length == len(password)


def test_rating_levels() -> None:
    """A long random one is rated higher than a minimal one."""
    assert check_password("T7#kd9!QmZ2$vL8x4Rw%nB").rating is PasswordRating.VERY_STRONG
    assert check_password("lemon river quiet bicycle").rating in (
        PasswordRating.STRONG_ENOUGH,
        PasswordRating.VERY_STRONG,
    )


def test_require_password() -> None:
    """The rules are enforced in code: weak and unequal passwords raise."""
    require_password("a few unrelated words 42", "a few unrelated words 42")
    with pytest.raises(LockError) as mismatch:
        require_password("a few unrelated words 42", "a few unrelated words 43")
    assert mismatch.value.reason is Reason.PASSWORD_MISMATCH
    with pytest.raises(LockError) as weak:
        require_password("short", "short")
    assert weak.value.reason is Reason.PASSWORD_TOO_WEAK
