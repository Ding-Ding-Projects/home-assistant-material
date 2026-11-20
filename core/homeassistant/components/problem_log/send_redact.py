"""Hide private details before the problem log leaves this machine.

Everything in this module is pure: it does not import Home Assistant, perform
input or output, or read the clock. The caller gathers what is private about
this home (host names, coordinates, the names of people, places and things)
into a `RedactContext` and passes the same `LabelBook` to every send, so that a
thing keeps the same label ("camera 2") across sends.

The names of programs are never rewritten: logger names and module paths,
file paths in tracebacks, integration domains, the product's own name and
common library names are set aside before any name is looked for, and put
back afterwards. Entity ids (`binary_sensor.front_window`) are replaced by the
label of their entity wherever they appear, inside quotes and lists too.

Redaction fails closed: `redact_for_sending` raises `RedactionError` on any
problem, and the caller must then send nothing.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
import hashlib
import ipaddress
import re

from .problem_core import redact as redact_confidential, secret_pattern

HIDDEN = "[hidden]"

# Labels by kind. Anything that is not a person, a place, a device or an area
# is labelled with its entity domain ("camera 2", "light 1").
KIND_PERSON = "person"
KIND_PLACE = "place"
KIND_DEVICE = "device"
KIND_AREA = "area"
_ALWAYS_HIDDEN_KINDS = {KIND_PERSON, KIND_PLACE}

# The product's own names. Never treated as a name somebody gave a thing.
PRODUCT_NAMES = frozenset(
    {"home assistant", "home assistant material", "homeassistant", "hass"}
)

# Libraries whose names show up in logger names and tracebacks.
LIBRARY_NAMES = frozenset(
    {
        "aiodns",
        "aiohasupervisor",
        "aiohttp",
        "aiohttp_cors",
        "aiozoneinfo",
        "anyio",
        "astral",
        "async_interrupt",
        "async_timeout",
        "asyncio",
        "attr",
        "attrs",
        "awesomeversion",
        "bleak",
        "bleak_retry_connector",
        "bluetooth_adapters",
        "bluetooth_auto_recovery",
        "bluetooth_data_tools",
        "certifi",
        "concurrent",
        "cryptography",
        "dbus_fast",
        "fnv_hash_fast",
        "habluetooth",
        "hass_nabucasa",
        "httpcore",
        "httpx",
        "ifaddr",
        "jinja2",
        "multidict",
        "orjson",
        "paho",
        "pip",
        "probatio",
        "psutil",
        "pydantic",
        "pyserial",
        "pyudev",
        "requests",
        "serial",
        "sqlalchemy",
        "ssl",
        "starlette",
        "threading",
        "typing",
        "ulid_transform",
        "urllib3",
        "uvicorn",
        "voluptuous",
        "websockets",
        "yaml",
        "yarl",
        "zeroconf",
    }
)

# Words a thing might be named that are also ordinary words of a log. A name
# equal to one of these is only replaced where it stands in quotes or as a
# friendly_name field.
COMMON_WORDS = frozenset(
    {
        "alarm",
        "area",
        "assist",
        "automation",
        "backup",
        "backups",
        "battery",
        "bridge",
        "button",
        "calendar",
        "camera",
        "climate",
        "cloud",
        "config",
        "conversation",
        "cover",
        "data",
        "date",
        "debug",
        "default",
        "device",
        "devices",
        "door",
        "energy",
        "entity",
        "error",
        "event",
        "fan",
        "gateway",
        "group",
        "history",
        "home",
        "house",
        "hub",
        "image",
        "info",
        "input",
        "light",
        "lights",
        "lock",
        "main",
        "media",
        "network",
        "notify",
        "number",
        "output",
        "person",
        "phone",
        "power",
        "printer",
        "recorder",
        "remote",
        "router",
        "scene",
        "script",
        "select",
        "sensor",
        "server",
        "service",
        "siren",
        "speaker",
        "state",
        "status",
        "sun",
        "switch",
        "system",
        "tablet",
        "tag",
        "test",
        "text",
        "time",
        "timer",
        "todo",
        "update",
        "updates",
        "vacuum",
        "valve",
        "value",
        "voice",
        "warning",
        "water",
        "weather",
        "window",
        "zone",
    }
)

# Entity domains known without asking the system (the entity platforms).
ENTITY_DOMAINS = frozenset(
    {
        "ai_task",
        "air_quality",
        "alarm_control_panel",
        "assist_satellite",
        "automation",
        "binary_sensor",
        "button",
        "calendar",
        "camera",
        "climate",
        "conversation",
        "counter",
        "cover",
        "date",
        "datetime",
        "device_tracker",
        "event",
        "fan",
        "geo_location",
        "group",
        "humidifier",
        "image",
        "image_processing",
        "input_boolean",
        "input_button",
        "input_datetime",
        "input_number",
        "input_select",
        "input_text",
        "lawn_mower",
        "light",
        "lock",
        "media_player",
        "notify",
        "number",
        "person",
        "plant",
        "remote",
        "scene",
        "schedule",
        "script",
        "select",
        "sensor",
        "siren",
        "stt",
        "sun",
        "switch",
        "tag",
        "text",
        "time",
        "timer",
        "todo",
        "tts",
        "update",
        "vacuum",
        "valve",
        "wake_word",
        "water_heater",
        "weather",
        "zone",
    }
)

# An object id with one of these looks like a file name, not an entity.
_FILE_EXTENSIONS = frozenset(
    {
        "cfg",
        "conf",
        "css",
        "db",
        "html",
        "ini",
        "js",
        "json",
        "log",
        "md",
        "py",
        "pyc",
        "sh",
        "so",
        "toml",
        "ts",
        "txt",
        "xml",
        "yaml",
        "yml",
    }
)

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

# Program text that is set aside before names are looked for.
_FILE_LINE = re.compile(r'File "[^"\n]*", line \d+(?:, in [\w<>.]+)?')
_PY_PATH = re.compile(r"(?<![\w.])(?:[\w.-]+[/\\])+[\w.-]+\.pyc?\b")
_MODULE = re.compile(
    r"(?<![\w.])(?:homeassistant|custom_components)(?:\.[A-Za-z_][A-Za-z0-9_]*)+"
)
_PRODUCT = re.compile(
    r"(?i)(?<![\w.])(?:home assistant(?: material)?|homeassistant|hass)(?![\w])"
)
_JSON_PROGRAM_FIELD = re.compile(
    r'"(?:id|date|integration|logger|level|build|first_seen|last_seen)":\s*'
    r'"(?:[^"\\\n]|\\.)*"'
)
_LIST_VALUE = re.compile(r"^(- [^:\n]{1,60}: )(\S+)$")
_DOTTED = re.compile(r"[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*")
_HEADING = re.compile(r"^(## \d{4}-\d{2}-\d{2} \d{2}:\d{2} )(\S+)$")
_FENCE = re.compile(r"^(?:~~~|```)")

_SHIELD_OPEN = ""
_SHIELD_CLOSE = ""
_SHIELDED = re.compile(f"{_SHIELD_OPEN}(\\d+){_SHIELD_CLOSE}")


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
    """What is private about this home, and which names belong to programs."""

    secrets: list[str] = field(default_factory=list)
    hostnames: list[str] = field(default_factory=list)
    coordinates: list[float] = field(default_factory=list)
    things: list[NamedThing] = field(default_factory=list)
    # Integration domains and names known to the loader.
    program_names: list[str] = field(default_factory=list)
    # Entity domains in use, besides `ENTITY_DOMAINS`.
    entity_domains: list[str] = field(default_factory=list)


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


def kind_of_domain(domain: str) -> str:
    """Return the label kind of an entity domain."""
    if domain == "zone":
        return KIND_PLACE
    if domain == "person":
        return KIND_PERSON
    return domain


class _Shield:
    """Texts set aside so that no later step can rewrite them."""

    def __init__(self) -> None:
        self.saved: list[str] = []

    def hold(self, text: str) -> str:
        self.saved.append(text)
        return f"{_SHIELD_OPEN}{len(self.saved) - 1}{_SHIELD_CLOSE}"

    def hold_match(self, match: re.Match[str]) -> str:
        return self.hold(match.group(0))

    def restore(self, text: str) -> str:
        # A held text may itself hold an earlier one.
        for _ in range(8):
            restored = _SHIELDED.sub(lambda m: self.saved[int(m.group(1))], text)
            if restored == text:
                return restored
            text = restored
        if _SHIELDED.search(text):
            raise RedactionError("Set-aside text could not be restored")
        return text


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
        {
            h
            for h in hostnames
            if h and len(h) >= 2 and h.lower() not in PRODUCT_NAMES
        },
        key=len,
        reverse=True,
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


def _entity_domains(context: RedactContext) -> frozenset[str]:
    return ENTITY_DOMAINS | {d for d in context.entity_domains if d}


def _is_known_entity_id(text: str, domains: frozenset[str]) -> bool:
    domain, _, object_id = text.partition(".")
    return (
        is_entity_id(text)
        and domain in domains
        and object_id not in _FILE_EXTENSIONS
    )


def _shield_paths(text: str, shield: _Shield) -> str:
    """Set aside file paths, module paths and the program fields of index.json."""
    text = _FILE_LINE.sub(shield.hold_match, text)
    text = _PY_PATH.sub(shield.hold_match, text)
    text = _MODULE.sub(
        lambda m: m.group(0)
        if _LOCAL_HOST.fullmatch(m.group(0))
        else shield.hold(m.group(0)),
        text,
    )
    return _JSON_PROGRAM_FIELD.sub(shield.hold_match, text)


def _shield_words(
    text: str, shield: _Shield, context: RedactContext, domains: frozenset[str]
) -> str:
    """Set aside the product's name, integration domains and library names."""
    # The fixed lines this feature writes: "## <date> <integration>" headings
    # and "- <label>: <logger or build>" lines, outside fenced blocks only.
    lines = text.split("\n")
    inside_fence = False
    for number, line in enumerate(lines):
        if _FENCE.match(line):
            inside_fence = not inside_fence
            continue
        if inside_fence:
            continue
        if heading := _HEADING.match(line):
            lines[number] = heading.group(1) + shield.hold(heading.group(2))
        elif (item := _LIST_VALUE.match(line)) and _is_program_value(
            item.group(2), domains
        ):
            lines[number] = item.group(1) + shield.hold(item.group(2))
    text = "\n".join(lines)

    text = _PRODUCT.sub(shield.hold_match, text)
    # A word that is also a person's or a place's name is not set aside.
    people = {
        name.strip().lower()
        for thing in context.things
        if thing.kind in _ALWAYS_HIDDEN_KINDS
        for name in thing.names
        if name
    }
    programs = {
        name
        for name in (*LIBRARY_NAMES, *context.program_names)
        if name and name.lower() not in people
    }
    # Domains and library names, with their dotted module paths.
    words = sorted(
        (p for p in programs if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", p)),
        key=len,
        reverse=True,
    )
    if words:
        pattern = re.compile(
            r"(?<![\w.])(?:"
            + "|".join(re.escape(w) for w in words)
            + r")(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?![\w])"
        )
        text = pattern.sub(
            lambda m: m.group(0)
            if _is_known_entity_id(m.group(0), domains)
            or _LOCAL_HOST.fullmatch(m.group(0))
            else shield.hold(m.group(0)),
            text,
        )
    return text


def _is_program_value(value: str, domains: frozenset[str]) -> bool:
    """Return True for a logger name or a version, never for an entity id or host."""
    if re.fullmatch(r"[0-9][0-9A-Za-z.+-]*", value):
        return True
    if not _DOTTED.fullmatch(value):
        return False
    first = value.split(".", 1)[0]
    return first not in domains and not _LOCAL_HOST.fullmatch(value)


def _hide_entity_ids(
    text: str,
    shield: _Shield,
    book: LabelBook,
    domains: frozenset[str],
    keep_names: bool,
) -> str:
    """Replace every entity id with its entity's label, keeping the kind readable."""
    pattern = re.compile(
        r"(?<![\w.\-/\\])(?:"
        + "|".join(re.escape(d) for d in sorted(domains, key=len, reverse=True))
        + r")\.[a-z0-9_]+(?![\w])(?!\.[A-Za-z0-9])"
    )

    def _swap(match: re.Match[str]) -> str:
        entity_id = match.group(0)
        domain, _, object_id = entity_id.partition(".")
        if object_id in _FILE_EXTENSIONS:
            return entity_id
        kind = kind_of_domain(domain)
        if keep_names and kind not in _ALWAYS_HIDDEN_KINDS:
            return entity_id
        return shield.hold(f"[{book.label(entity_id, kind)}]")

    return pattern.sub(_swap, text)


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def _hide_names(
    text: str,
    context: RedactContext,
    shield: _Shield,
    book: LabelBook,
    domains: frozenset[str],
    keep_names: bool,
) -> str:
    """Replace the names people gave things, and people's and places' names.

    Names of people and places match in any case, as whole words, as before.
    A thing's name matches as given, or as its slug ("front_door"), as a
    whole word or phrase. A thing named like a program (an integration, a
    library, the product) is never replaced; one whose name is shorter than
    four characters or an ordinary word is only replaced in quotes or as a
    friendly_name field.
    """
    programs = {p.lower() for p in context.program_names if p} | LIBRARY_NAMES
    folded: dict[str, NamedThing] = {}
    exact: dict[str, NamedThing] = {}
    quoted: dict[str, NamedThing] = {}
    for thing in context.things:
        person_like = thing.kind in _ALWAYS_HIDDEN_KINDS
        if keep_names and not person_like:
            continue
        for raw in thing.names:
            name = raw.strip() if raw else ""
            if len(name) < 2 or _is_known_entity_id(name, domains):
                continue
            lower = name.lower()
            if lower in PRODUCT_NAMES:
                quoted.setdefault(name, thing)
                continue
            if person_like:
                if len(name) >= 3:
                    folded.setdefault(lower, thing)
                else:
                    exact.setdefault(name, thing)
                continue
            if lower in programs:
                continue
            restricted = len(name) < 4 or lower in COMMON_WORDS
            for form in {name, _slug(name)}:
                if len(form) < 2 or form.lower() in programs:
                    continue
                if restricted or form.lower() in COMMON_WORDS:
                    quoted.setdefault(form, thing)
                else:
                    exact.setdefault(form, thing)

    def _label(thing: NamedThing | None) -> str:
        if thing is None:
            return HIDDEN
        return shield.hold(f"[{book.label(thing.key, thing.kind)}]")

    def _alternation(table: dict[str, NamedThing]) -> str:
        # Longest first, so "Front door camera" wins over "Front door".
        return "|".join(re.escape(n) for n in sorted(table, key=len, reverse=True))

    if folded:
        pattern = re.compile(
            rf"(?<!\w)(?:{_alternation(folded)})(?!\w)", re.IGNORECASE
        )
        text = pattern.sub(lambda m: _label(folded.get(m.group(0).lower())), text)
    if exact:
        pattern = re.compile(rf"(?<![\w.])(?:{_alternation(exact)})(?!\w)")
        text = pattern.sub(lambda m: _label(exact.get(m.group(0))), text)
    if quoted:
        names = _alternation(quoted)
        field_pattern = re.compile(
            rf"(friendly_name['\"]?\s*[:=]\s*['\"]?)({names})(?![\w])"
        )
        text = field_pattern.sub(
            lambda m: m.group(1) + _label(quoted.get(m.group(2))), text
        )
        quote_pattern = re.compile(rf"(?<=['\"])(?:{names})(?=['\"])")
        text = quote_pattern.sub(lambda m: _label(quoted.get(m.group(0))), text)
    return text


def redact_text(
    text: str, context: RedactContext, book: LabelBook, *, keep_names: bool = False
) -> str:
    """Return the text with every private detail hidden."""
    # Nothing from outside may pose as set-aside text.
    text = text.replace(_SHIELD_OPEN, "?").replace(_SHIELD_CLOSE, "?")
    text = redact_confidential(text, context.secrets)
    text = _URL.sub(_hide_url, text)
    text = _HOME_FOLDER.sub(HIDDEN, text)
    # Before program text is set aside, so a host name in a path is hidden too.
    text = _hide_hostnames(text, context.hostnames)
    domains = _entity_domains(context)
    shield = _Shield()
    text = _shield_paths(text, shield)
    text = _hide_entity_ids(text, shield, book, domains, keep_names)
    # Names first: a name such as "Front door" holds a word ("door") that is
    # also an integration, and setting that word aside would split the name.
    # A thing named exactly like a program is skipped by the name step itself.
    text = _hide_names(text, context, shield, book, domains, keep_names)
    text = _shield_words(text, shield, context, domains)
    text = _hide_network(text)
    text = _LOCAL_HOST.sub(HIDDEN, text)
    text = _hide_coordinates(text, context.coordinates)
    return shield.restore(text)


def leaked(text: str, forbidden: Iterable[str], secrets: Iterable[str]) -> bool:
    """Return True if a value that must never leave is still in the text.

    `forbidden` values (the sign-in used to send) must not appear anywhere.
    Secrets follow the same rule as their removal: a short one only counts
    where it stands on its own.
    """
    if any(value and value in text for value in forbidden):
        return True
    return any(
        secret_pattern(s).search(text) for s in secrets if s and len(s) >= 4
    )


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
        for path, text in result.items():
            if leaked(text, blocked, context.secrets) or leaked(
                path, blocked, context.secrets
            ):
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
