"""Tests for the password rules."""

import random
import string

import pytest

from homeassistant.components.registry_storage.errors import LockError, Reason
from homeassistant.components.registry_storage.passwords import (
    MIN_ENTROPY_BITS,
    PasswordProblem,
    PasswordRating,
    check_password,
    estimate_bits,
    require_password,
)

STRONG = "obsidian marmalade tundra gazebo nutmeg"


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
        # A capitalised word, a year and another word: long enough, but built from parts
        # an attacker tries first. The earlier length-times-classes estimate passed these.
        "Capitalword2024word",
        "Summerholiday2023!",
        "Sunshine1987Rainbow",
        "Bluehouse2020greencar",
        "Winter2024Winter2025",
        # A name and a date, a keyboard walk, letter-for-digit swaps.
        "Michael19851225!",
        "1qaz2wsx3edc4rfv",
        "P@ssw0rdP@ssw0rd99",
        "Tr0ub4dor&3horse",
        # Four common words are below the bar, and the best known phrase is listed.
        "a few unrelated words 42",
        "lemon river quiet bicycle",
        "correct horse battery staple",
        "Correct-Horse-Battery-Staple",
    ],
)
def test_patterned_phrases_rejected(password: str) -> None:
    """Long passwords made of words, years, dates and keyboard runs are too easy."""
    result = check_password(password)
    assert len(password) >= 14
    assert not result.acceptable
    assert result.bits < MIN_ENTROPY_BITS


@pytest.mark.parametrize(
    "password",
    [
        "T7#kd9!QmZ2$vL8x",
        "q8V#m2Lx!r4Tz9",
        STRONG,
        "zymurgy quokka fjord xylem pangolin",
        "cobalt-yonder-wombat-sprocket-larkspur",
        "Lantern Pebble Quorum Sizzle Marrow",
    ],
)
def test_accepted(password: str) -> None:
    """Random passwords and phrases of five uncommon words are accepted."""
    result = check_password(password)
    assert result.problem is None
    assert result.acceptable
    assert result.length == len(password)


def test_random_passwords_accepted() -> None:
    """Truly random 14 character passwords from the full keyboard always pass."""
    chooser = random.Random(20261118)
    alphabet = string.ascii_letters + string.digits + string.punctuation
    for _ in range(300):
        password = "".join(chooser.choice(alphabet) for _ in range(14))
        assert check_password(password).acceptable, password


def test_long_passwords_stay_quick_and_strong() -> None:
    """Very long passwords are looked at in part and still count as strong."""
    chooser = random.Random(7)
    password = "".join(chooser.choice(string.ascii_letters) for _ in range(500))
    assert estimate_bits(password) > MIN_ENTROPY_BITS
    assert not check_password("a" * 500).acceptable


def test_rating_levels() -> None:
    """A long random one is rated higher than a minimal one."""
    assert check_password("T7#kd9!QmZ2$vL8x4Rw%nB").rating is PasswordRating.VERY_STRONG
    assert check_password(STRONG).rating in (
        PasswordRating.STRONG_ENOUGH,
        PasswordRating.VERY_STRONG,
    )


def test_require_password() -> None:
    """The rules are enforced in code: weak and unequal passwords raise."""
    require_password(STRONG, STRONG)
    with pytest.raises(LockError) as mismatch:
        require_password(STRONG, STRONG + "!")
    assert mismatch.value.reason is Reason.PASSWORD_MISMATCH
    with pytest.raises(LockError) as weak:
        require_password("short", "short")
    assert weak.value.reason is Reason.PASSWORD_TOO_WEAK
    with pytest.raises(LockError) as patterned:
        require_password("Capitalword2024word", "Capitalword2024word")
    assert patterned.value.reason is Reason.PASSWORD_TOO_WEAK
