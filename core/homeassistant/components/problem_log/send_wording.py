"""The owner's wording file, used in the sent problem log when they turn it on.

Pure: no Home Assistant imports, no input or output. The entries are checked
with the same limits and rules as the browser applies to a dropped file, and
the replacement follows the browser's rules: the longest key wins, case
matters, a key only matches whole words, and a key touching an identifier, a
path or an address is left alone. Only this feature's own headings, labels,
README and commit subject are passed through it; log lines, logger names,
code and anything in a fenced block never are.

The entries themselves are never written to the repository, logged, or put in
a command result.
"""

from collections.abc import Callable
import json
import re

# The same limits as frontend/src/common/vocabulary/personal-vocabulary.ts.
MAX_BYTES = 262144
MAX_KEY = 160
MAX_VALUE = 1000

_UNSAFE_KEYS = {"__proto__", "prototype", "constructor"}
_CONTROL = re.compile(r"[\u0000-\u001f\u007f-\u009f]")
_LITERAL_BEFORE = set("_/\\@.")
_LITERAL_AFTER = set("_/\\@")


class WordingRefused(Exception):
    """The entries failed a check. Carries a plain code, never an entry."""

    def __init__(self, code: str) -> None:
        """Initialize with a plain code."""
        super().__init__(code)
        self.code = code


def check_entries(data: object) -> dict[str, str]:
    """Return the entries if every one passes; raise WordingRefused otherwise."""
    if not isinstance(data, dict) or not data:
        raise WordingRefused("bad_entries")
    try:
        size = len(
            json.dumps({"schemaVersion": 1, "entries": data}, ensure_ascii=False)
            .encode("utf-8")
        )
    except TypeError, ValueError:
        raise WordingRefused("malformed") from None
    if size > MAX_BYTES:
        raise WordingRefused("too_large")
    entries: dict[str, str] = {}
    for key, value in data.items():
        if not isinstance(key, str) or key in _UNSAFE_KEYS:
            raise WordingRefused("unsafe_key")
        if not key.strip() or len(key) > MAX_KEY:
            raise WordingRefused("bad_key")
        if not isinstance(value, str) or len(value) > MAX_VALUE:
            raise WordingRefused("bad_value")
        if _CONTROL.search(key) or _CONTROL.search(value):
            raise WordingRefused("control_character")
        entries[key] = value
    return entries


def _letter_or_digit(char: str) -> bool:
    return bool(char) and char.isalnum()


def build_replacer(entries: dict[str, str]) -> Callable[[str], str]:
    """Return the function that rewrites one of this feature's own phrases."""
    table = dict(entries)
    for key, value in entries.items():
        first = key[0]
        if first.upper() == first or first.lower() != first:
            continue
        capital = first.upper() + key[1:]
        if capital not in table:
            lead = value[:1]
            small = lead.lower() == lead and lead.upper() != lead
            table[capital] = lead.upper() + value[1:] if small else value
    keys = sorted((k for k in table if k), key=len, reverse=True)
    if not keys:
        return lambda text: text
    pattern = re.compile("|".join(re.escape(k) for k in keys))

    def replace(text: str) -> str:
        def _swap(match: re.Match[str]) -> str:
            start, end = match.span()
            before = text[start - 1] if start else ""
            after = text[end] if end < len(text) else ""
            after_next = text[end + 1] if end + 1 < len(text) else ""
            if (
                (before and (_letter_or_digit(before) or before in _LITERAL_BEFORE))
                or (after and (_letter_or_digit(after) or after in _LITERAL_AFTER))
                or (after == "." and _letter_or_digit(after_next))
                or (after == ":" and after_next == "/")
            ):
                return match.group(0)
            value = table.get(match.group(0))
            return value if value and value.strip() else match.group(0)

        return pattern.sub(_swap, text) if text else text

    return replace
