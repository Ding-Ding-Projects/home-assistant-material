"""Hide private details before the problem log leaves this machine.

Everything in this module is pure: it does not import Home Assistant, perform
input or output, or read the clock. The caller gathers what is private about
this home (host names, coordinates, the names of people, places and things)
into a `RedactContext` and passes the same `LabelBook` to every send, so that a
thing keeps the same label ("camera 2") across sends.

Redaction fails closed: `redact_for_sending` raises `RedactionError` on any
problem, and the caller must then send nothing.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
import hashlib
import ipaddress
import re

from .problem_core import redact as redact_confidential

HIDDEN = "[hidden]"

# Labels by kind. Anything that is not a person, a place, a device or an area
# is labelled with its entity domain ("camera 2", "light 1").
KIND_PERSON = "person"
KIND_PLACE = "place"
KIND_DEVICE = "device"
KIND_AREA = "area"
_ALWAYS_HIDDEN_KINDS = {KIND_PERSON, KIND_PLACE}

_URL = re.compile(r"\b[A-Za-z][A-Za-z0-9+.-]*://[^\s<>\"'`]+")
_MAC = re.compile(
    r"(?<![0-9A-Fa-f:-])(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}(?![0-9A-Fa-f:-])"
)
_IPV6_CANDIDATE = re.compile(
    r"(?<![0-9A-Za-z:.])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?:%[0-9A-Za-z]+)?(?![0-9A-Za-z:])"
)
_IPV4 = re.compile(r"(?<![0-9.])(?:\d{1,3}\.){3}\d{1,3}(?![0-9]|\.\d)")
_LOCAL_HOST = re.compile(
    r"(?i)\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
    r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*"
    r"\.(?:local|lan|home|internal|localdomain|home\.arpa|fritz\.box|duckdns\.org|nabu\.casa|ui\.nabu\.casa)\b"
)
_COORDINATE_PAIR = re.compile(
    r"(?<![\d.])-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}(?![\d.])"
)
_DECIMAL = re.compile(r"(?<![\d.])-?\d{1,3}\.\d{2,}(?![\d.])")
_HOME_FOLDER = re.compile(
    r"(?i)(?:/home/|/Users/|[A-Z]:\\Users\\|[A-Z]:/Users/)[^\\/\s\"']+"
)
_ENTITY_ID = re.compile(r"\b[a-z_][a-z0-9_]*\.[a-z0-9_]+\b")


class RedactionError(Exception):
    """Redaction could not be completed; nothing may be sent."""


@dataclass(frozen=True)
class NamedThing:
    """Something private with one stable label.

    `key` identifies the thing (an entity id, a device or user id); `names` are
    the texts that must not leave (its friendly name, its entity id).
    """

    key: str
    kind: str
    names: tuple[str, ...]


@dataclass
class RedactContext:
    """What is private about this home."""

    secrets: list[str] = field(default_factory=list)
    hostnames: list[str] = field(default_factory=list)
    coordinates: list[float] = field(default_factory=list)
    things: list[NamedThing] = field(default_factory=list)


@dataclass
class LabelBook:
    """Stable labels: the same thing gets the same label in every send.

    Only hashes of the keys are kept, never the names themselves.
    """

    labels: dict[str, str] = field(default_factory=dict)
    counters: dict[str, int] = field(default_factory=dict)

    @staticmethod
    def _hash(key: str) -> str:
        return hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]

    def label(self, key: str, kind: str) -> str:
        """Return the label for a thing, giving it the next number if new."""
        hashed = self._hash(f"{kind}\n{key}")
        if (existing := self.labels.get(hashed)) is not None:
            return existing
        number = self.counters.get(kind, 0) + 1
        self.counters[kind] = number
        label = f"{kind.replace('_', ' ')} {number}"
        self.labels[hashed] = label
        return label

    def as_dict(self) -> dict[str, dict[str, str] | dict[str, int]]:
        """Return the book for storage."""
        return {"labels": dict(self.labels), "counters": dict(self.counters)}

    @classmethod
    def from_dict(cls, data: object) -> LabelBook:
        """Read a stored book, ignoring anything malformed."""
        if not isinstance(data, dict):
            return cls()
        labels = data.get("labels")
        counters = data.get("counters")
        return cls(
            {str(k): str(v) for k, v in labels.items()}
            if isinstance(labels, dict)
            else {},
            {str(k): int(v) for k, v in counters.items() if isinstance(v, int)}
            if isinstance(counters, dict)
            else {},
        )


def _hide_url(match: re.Match[str]) -> str:
    """Keep the scheme, host and path of a web address; hide its query and fragment."""
    url = match.group(0)
    trailing = ""
    while url and url[-1] in ".,;:)]}":
        trailing = url[-1] + trailing
        url = url[:-1]
    for mark in ("?", "#"):
        if mark in url:
            url = url.split(mark, 1)[0] + mark + HIDDEN
            break
    return url + trailing


def _is_ipv6(text: str) -> bool:
    candidate = text.split("%", 1)[0]
    if candidate.count(":") < 2:
        return False
    # Times such as 18:52:01 have two colons and only digits: not an address.
    if "::" not in candidate and candidate.count(":") < 3:
        if not re.search(r"[A-Fa-f]", candidate):
            return False
    try:
        ipaddress.IPv6Address(candidate)
    except ValueError:
        return False
    return True


def _is_ipv4(text: str) -> bool:
    try:
        ipaddress.IPv4Address(text)
    except ValueError:
        return False
    return True


def _hide_network(text: str) -> str:
    text = _MAC.sub(HIDDEN, text)
    text = _IPV6_CANDIDATE.sub(
        lambda m: HIDDEN if _is_ipv6(m.group(0)) else m.group(0), text
    )
    return _IPV4.sub(lambda m: HIDDEN if _is_ipv4(m.group(0)) else m.group(0), text)


def _hide_hostnames(text: str, hostnames: Iterable[str]) -> str:
    for name in sorted(
        {h for h in hostnames if h and len(h) >= 2}, key=len, reverse=True
    ):
        text = re.sub(rf"(?i)(?<![\w.-]){re.escape(name)}(?![\w-])", HIDDEN, text)
    return _LOCAL_HOST.sub(HIDDEN, text)


def _hide_coordinates(text: str, coordinates: Iterable[float]) -> str:
    text = _COORDINATE_PAIR.sub(HIDDEN, text)
    known = [float(c) for c in coordinates]
    if not known:
        return text

    def _check(match: re.Match[str]) -> str:
        raw = match.group(0)
        decimals = len(raw.split(".", 1)[1])
        value = float(raw)
        tolerance = 0.5 * 10 ** (-decimals) + 1e-12
        if any(abs(value - c) <= tolerance for c in known):
            return HIDDEN
        return raw

    return _DECIMAL.sub(_check, text)


def _hide_names(
    text: str, things: Iterable[NamedThing], book: LabelBook, keep_names: bool
) -> str:
    """Replace every name with the label of its thing.

    Labels are handed out when a name is first met, so numbers follow the order
    in which things appear in the log. Names of three or more characters match
    in any case; two-character names only exactly.
    """
    folded: dict[str, NamedThing] = {}
    exact: dict[str, NamedThing] = {}
    for thing in things:
        if keep_names and thing.kind not in _ALWAYS_HIDDEN_KINDS:
            continue
        for raw in thing.names:
            name = raw.strip() if raw else ""
            if len(name) >= 3:
                folded.setdefault(name.lower(), thing)
            elif len(name) == 2:
                exact.setdefault(name, thing)

    def _label(thing: NamedThing | None) -> str:
        if thing is None:
            return HIDDEN
        return f"[{book.label(thing.key, thing.kind)}]"

    for table, flags in ((folded, re.IGNORECASE), (exact, 0)):
        if not table:
            continue
        # Longest first, so "Front door camera" wins over "Front door".
        names = sorted(table, key=len, reverse=True)
        pattern = re.compile(
            r"(?<!\w)(?:" + "|".join(re.escape(n) for n in names) + r")(?!\w)", flags
        )
        if flags:
            text = pattern.sub(lambda m: _label(folded.get(m.group(0).lower())), text)
        else:
            text = pattern.sub(lambda m: _label(exact.get(m.group(0))), text)
    return text


def redact_text(
    text: str, context: RedactContext, book: LabelBook, *, keep_names: bool = False
) -> str:
    """Return the text with every private detail hidden."""
    text = redact_confidential(text, context.secrets)
    text = _URL.sub(_hide_url, text)
    text = _HOME_FOLDER.sub(HIDDEN, text)
    text = _hide_names(text, context.things, book, keep_names)
    text = _hide_network(text)
    text = _hide_hostnames(text, context.hostnames)
    return _hide_coordinates(text, context.coordinates)


def redact_for_sending(
    texts: dict[str, str],
    context: RedactContext,
    book: LabelBook,
    *,
    keep_names: bool = False,
    forbidden: Iterable[str] = (),
) -> dict[str, str]:
    """Redact every text, then check that nothing forbidden is left.

    `forbidden` are exact values (such as the sign-in used to send) that must
    never appear in what is sent. Any error raises `RedactionError`.
    """
    try:
        result = {
            path: redact_text(text, context, book, keep_names=keep_names)
            for path, text in texts.items()
        }
        blocked = [value for value in forbidden if value]
        blocked.extend(s for s in context.secrets if s and len(s) >= 4)
        for path, text in result.items():
            for value in blocked:
                if value in text or value in path:
                    raise RedactionError("A confidential value was still present")  # noqa: TRY301
    except RedactionError:
        raise
    except Exception as err:
        raise RedactionError(type(err).__name__) from err
    return result


def entity_names(entity_id: str, friendly_name: str | None) -> tuple[str, ...]:
    """Return the texts that identify an entity: its id, object id and name."""
    names = [entity_id]
    _domain, _, object_id = entity_id.partition(".")
    if len(object_id) >= 3:
        names.append(object_id)
    if friendly_name:
        names.append(friendly_name)
    return tuple(names)


def is_entity_id(text: str) -> bool:
    """Return True if the text has the shape of an entity id."""
    return _ENTITY_ID.fullmatch(text) is not None
