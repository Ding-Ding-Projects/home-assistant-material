"""Password rules, enforced in code and not only in the form.

What the password protects sits in a public registry, where anyone can copy it and
try passwords offline for as long as they like. So the estimate does not count
character classes: it looks for the patterns people actually use (words, common
passwords, years and dates, keyboard runs, repeats, sequences, letter-for-digit
swaps, capitalisation and added digits or symbols) and prices the password at the
cheapest way an attacker could build it from those parts.
"""

from dataclasses import dataclass
from enum import StrEnum
from itertools import pairwise
import math
import re
from typing import Final

from homeassistant.util import dt as dt_util

from .crypto import MIN_PASSWORD_LENGTH
from .errors import LockError, Reason
from .password_words import COMMON_PASSWORDS, COMMON_WORDS

# About 2**60 guesses: far beyond a large guessing farm at the lock's cost.
MIN_ENTROPY_BITS: Final = 60.0
STRONG_ENTROPY_BITS: Final = 80.0

# Long passwords are priced in pieces of this length; the pieces' estimates add up.
_CHUNK: Final = 48
# Only this much is looked at, to keep the check quick; the rest only adds strength.
_MAX_LOOKED_AT: Final = 64
_MAX_PARTS: Final = 24
# Assumed size of the vocabulary an attacker tries for anything that looks like a word.
_WORD_LIKE_GUESSES: Final = 2**17
_MIN_GUESSES_SINGLE: Final = 10
_MIN_GUESSES_MULTI: Final = 50
_SEPARATORS: Final = " -_.,+:;/|"

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
_LEET: Final = {
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "8": "b",
    "9": "g",
    "@": "a",
    "$": "s",
    "!": "i",
    "|": "l",
    "+": "t",
}
_LEET_ALT: Final = {"1": "l", "!": "l", "|": "i", "0": "o"}
_LEET_BOTH: Final = {**_LEET, **_LEET_ALT}
_KEYBOARD_ROWS: Final = (
    ("`1234567890-=", "~!@#$%^&*()_+", 0.0),
    ("qwertyuiop[]\\", "QWERTYUIOP{}|", 0.5),
    ("asdfghjkl;'", 'ASDFGHJKL:"', 0.75),
    ("zxcvbnm,./", "ZXCVBNM<>?", 1.25),
)
_VOWELS: Final = frozenset("aeiouy")


def _ranked(words: tuple[str, ...] | list[str]) -> dict[str, int]:
    ranks: dict[str, int] = {}
    for word in words:
        ranks.setdefault(word, len(ranks) + 1)
    return ranks


_DICTIONARIES: Final = (_ranked(COMMON_PASSWORDS), _ranked(COMMON_WORDS))
_MAX_WORD: Final = max(len(word) for ranks in _DICTIONARIES for word in ranks)


def _key_positions() -> dict[str, tuple[int, float, bool]]:
    positions: dict[str, tuple[int, float, bool]] = {}
    for row, (plain, shifted, offset) in enumerate(_KEYBOARD_ROWS):
        for column, (low, high) in enumerate(zip(plain, shifted, strict=True)):
            positions[low] = (row, column + offset, False)
            positions[high] = (row, column + offset, True)
    return positions


_KEYS: Final = _key_positions()
_KEY_COUNT: Final = sum(len(plain) for plain, _shifted, _offset in _KEYBOARD_ROWS)
_KEY_DEGREE: Final = 6.0


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


def _pool(text: str) -> int:
    pool = 0
    if re.search(r"[a-z]", text):
        pool += 26
    if re.search(r"[A-Z]", text):
        pool += 26
    if re.search(r"[0-9]", text):
        pool += 10
    if re.search(r"[^a-zA-Z0-9]", text):
        pool += 33
    return max(pool, 1)


def _case_bits(token: str) -> float:
    """Extra guesses for the capitalisation of a word that is otherwise lower case."""
    letters = [char for char in token if char.isalpha()]
    upper = sum(char.isupper() for char in letters)
    lower = len(letters) - upper
    if upper == 0:
        return 0.0
    if lower == 0 or (upper == 1 and (letters[0].isupper() or letters[-1].isupper())):
        return 1.0
    return math.log2(
        sum(math.comb(len(letters), k) for k in range(1, min(upper, lower) + 1))
    )


def _looks_like_a_word(token: str) -> bool:
    """Ordinary words alternate vowels and consonants; random letters rarely do."""
    if not 5 <= len(token) <= 14 or not token.isalpha() or not token.isascii():
        return False
    # Words are typed in lower case, capitalised or in capitals; not in random case.
    if not (token.islower() or token.isupper() or token[1:].islower()):
        return False
    lower = token.lower()
    vowels = sum(char in _VOWELS for char in lower)
    if not 0.25 <= vowels / len(lower) <= 0.65:
        return False
    if re.search(r"[^aeiouy]{4}|[aeiouy]{3}|(.)\1\1", lower):
        return False
    return True


def _leet_variants(text: str) -> list[tuple[str, list[bool]]]:
    """The text with look-alike characters read as letters, and where that happened."""
    variants: list[tuple[str, list[bool]]] = []
    if not any(char in _LEET for char in text):
        return variants
    for table in (_LEET, _LEET_BOTH):
        plain = "".join(table.get(char, char) for char in text)
        changed = [table.get(char, char) != char for char in text]
        if any(changed):
            variants.append((plain, changed))
    return variants


def _dictionary_bits(text: str, i: int, j: int) -> float | None:
    """Cheapest guess cost of text[i:j] as a listed word, with its decorations."""
    token = text[i:j]
    if len(token) < 3:
        return None
    lower = token.lower()
    # (spelling as typed, extra bits for reading it that way)
    readings = [(lower, 0.0), (lower[::-1], 1.0)]
    readings.extend(
        (plain, sum(changed) + 1.0) for plain, changed in _leet_variants(lower)
    )
    candidates = [
        math.log2(rank) + extra
        for ranks in _DICTIONARIES
        for word, extra in readings
        if (rank := ranks.get(word)) is not None
    ]
    return min(candidates) + _case_bits(token) if candidates else None


def _year_bits(token: str) -> float | None:
    if re.fullmatch(r"(19|20)\d\d", token):
        return math.log2(max(abs(int(token) - dt_util.now().year), 20))
    return None


def _date_bits(token: str) -> float | None:
    """Day, month and year in any common order, with or without separators."""
    match = re.fullmatch(r"(\d{1,4})([-/. _]?)(\d{1,2})\2(\d{1,4})", token)
    if match is None or len(token) < 4:
        return None
    first, separator, middle, last = match.groups()
    parts = (first, middle, last)
    year_first = len(first) == 4
    year = int(first if year_first else last)
    if len(str(year)) <= 2:
        year += 2000 if year < 50 else 1900
    if not 1900 <= year <= 2099:
        return None
    day_month = (middle, last) if year_first else (first, middle)
    numbers = sorted(int(part) for part in day_month)
    if not (1 <= numbers[0] <= 12 and 1 <= numbers[1] <= 31) or not all(parts):
        return None
    span = max(abs(year - dt_util.now().year), 20)
    return math.log2(365 * span * (4 if separator else 1))


def _sequence_bits(token: str) -> float | None:
    """A run with a steady step, such as abcd, 2468 or zyx."""
    if len(token) < 3:
        return None
    steps = {ord(b) - ord(a) for a, b in pairwise(token)}
    if len(steps) != 1 or not 1 <= abs(step := steps.pop()) <= 5:
        return None
    if not (token.isdigit() or token.isalpha()):
        return None
    if token[0] in "aAzZ019":
        base = 4
    elif token.isdigit():
        base = 10
    else:
        base = 26 * (2 if token.isupper() else 1)
    return math.log2(base * len(token) * (2 if step < 0 else 1) * abs(step))


def _keyboard_bits(token: str) -> float | None:
    """Neighbouring keys pressed one after the other, such as qwerty or 1qaz2wsx."""
    if len(token) < 4 or any(char not in _KEYS for char in token):
        return None
    turns = 0
    direction: tuple[int, float] | None = None
    for a, b in pairwise(token):
        row_a, col_a, _ = _KEYS[a]
        row_b, col_b, _ = _KEYS[b]
        if abs(row_a - row_b) > 1 or abs(col_a - col_b) > 1 or (a == b):
            return None
        step = (row_b - row_a, col_b - col_a)
        if step != direction:
            turns += 1
            direction = step
    guesses = sum(
        math.comb(length - 1, turn - 1) * _KEY_COUNT * _KEY_DEGREE**turn
        for length in range(2, len(token) + 1)
        for turn in range(1, min(turns, length - 1) + 1)
    )
    shifted = sum(_KEYS[char][2] for char in token)
    if shifted and shifted < len(token):
        guesses *= sum(
            math.comb(len(token), k)
            for k in range(1, min(shifted, len(token) - shifted) + 1)
        )
    elif shifted:
        guesses *= 2
    return math.log2(max(guesses, 1))


def _repeat_bits(text: str, i: int, j: int) -> float | None:
    """The same piece typed again and again, such as aaaa or abcabcabc."""
    token = text[i:j]
    match = re.fullmatch(r"(.+?)\1+", token)
    if match is None:
        return None
    unit = match.group(1)
    count = len(token) // len(unit)
    return _estimate(unit) + math.log2(count)


def _brute_bits(token: str) -> float:
    return len(token) * math.log2(_pool(token))


def _whole_run(text: str, i: int, j: int) -> bool:
    """Whether text[i:j] is a complete run of letters, as typed between other characters.

    A capital letter after a lower case one starts a new run, so CamelCase parts count.
    """
    starts = (
        i == 0
        or not text[i - 1].isalpha()
        or (text[i].isupper() and text[i - 1].islower())
    )
    ends = (
        j == len(text)
        or not text[j].isalpha()
        or (text[j].isupper() and text[j - 1].islower())
    )
    return starts and ends


def _pattern_bits(text: str, i: int, j: int) -> float:
    """The cheapest way to make text[i:j] as one recognised piece, or inf."""
    token = text[i:j]
    options = [math.inf]
    if j - i <= _MAX_WORD and (bits := _dictionary_bits(text, i, j)) is not None:
        options.append(bits)
    if _whole_run(text, i, j) and _looks_like_a_word(token):
        options.append(math.log2(_WORD_LIKE_GUESSES) + _case_bits(token))
    found = (finder(token) for finder in _FINDERS)
    options.extend(bits for bits in found if bits is not None)
    if j - i >= 2 and (bits := _repeat_bits(text, i, j)) is not None:
        options.append(bits)
    return min(options)


_FINDERS: Final = (_year_bits, _date_bits, _sequence_bits, _keyboard_bits)


def _floor(i: int, j: int) -> float:
    return math.log2(_MIN_GUESSES_SINGLE if j - i == 1 else _MIN_GUESSES_MULTI)


def _estimate(text: str) -> float:
    """Bits for the cheapest split of text into pieces, counting the order of pieces.

    Characters that match no pattern are priced by their character classes, and two
    such stretches may not sit next to each other: otherwise random text could be cut
    into single-class bits that look cheaper than the text really is.
    """
    if not text:
        return 0.0
    if len(text) > _CHUNK:
        return sum(
            _estimate(text[start : start + _CHUNK])
            for start in range(0, len(text), _CHUNK)
        )
    size = len(text)
    infinity = math.inf
    # best[k][n][b]: cheapest bits for text[:k] in n pieces, b = last piece was unmatched.
    best = [
        [[infinity, infinity] for _ in range(_MAX_PARTS + 1)] for _ in range(size + 1)
    ]
    best[0][0][0] = 0.0
    for end in range(1, size + 1):
        target = best[end]
        for start in range(end):
            floor = _floor(start, end)
            pattern = max(_pattern_bits(text, start, end), floor)
            brute = max(_brute_bits(text[start:end]), floor)
            row = best[start]
            for count in range(_MAX_PARTS):
                after_match, after_brute = row[count]
                low = min(after_match, after_brute)
                cell = target[count + 1]
                cell[0] = min(cell[0], low + pattern)
                cell[1] = min(cell[1], after_match + brute)
    return min(
        min(best[size][count]) + math.log2(math.factorial(count))
        for count in range(1, _MAX_PARTS + 1)
        if min(best[size][count]) < infinity
    )


def estimate_bits(password: str) -> float:
    """Estimate how many bits of guessing the password costs an informed attacker."""
    password = password[:_MAX_LOOKED_AT]
    options = [_estimate(password)]
    separator_bits = math.log2(len(_SEPARATORS))
    for separator in _SEPARATORS:
        if separator not in password:
            continue
        words = password.split(separator)
        # Only text that reads as parts typed between one repeated separator.
        if len(words) < 3 or not all(words):
            continue
        # A phrase: each part chosen on its own, and the separator chosen once.
        options.append(sum(_estimate(word) for word in words) + separator_bits)
        options.append(_estimate("".join(words)) + separator_bits)
    return min(options)


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
    """Look at a password: length, obvious choices, repeats and a pattern-aware estimate."""
    length = len(password)
    problem: PasswordProblem | None = None
    bits = estimate_bits(password)
    if length < MIN_PASSWORD_LENGTH:
        problem = PasswordProblem.TOO_SHORT
    elif _is_obvious(password):
        problem = PasswordProblem.OBVIOUS
    elif _effective_length(password) < MIN_PASSWORD_LENGTH * 0.6:
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
