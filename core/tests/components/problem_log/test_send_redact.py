"""Tests for hiding private details before the problem log is sent.

Each group the owner was promised is hidden is covered here, together with
the stable labels and the fail-closed behaviour: if redaction breaks, the
caller gets an error and must send nothing.
"""

import pytest

from homeassistant.components.problem_log import send_redact
from homeassistant.components.problem_log.send_redact import (
    HIDDEN,
    LabelBook,
    NamedThing,
    RedactContext,
    RedactionError,
    entity_names,
    redact_for_sending,
    redact_text,
)

CAMERA = NamedThing(
    "camera.front_door",
    "camera",
    entity_names("camera.front_door", "Front door"),
)
PERSON = NamedThing("person.alex", "person", entity_names("person.alex", "Alex Moreau"))
ZONE = NamedThing(
    "zone.cottage", "place", entity_names("zone.cottage", "Lakeside Cottage")
)
AREA = NamedThing("area:1", "area", ("Garden shed",))
DEVICE = NamedThing("device:1", "device", ("Hallway hub",))


def _context(**over: object) -> RedactContext:
    args: dict[str, object] = {
        "secrets": ["hunter2-secret"],
        "hostnames": ["homeserver", "ha.example.net"],
        "coordinates": [52.3731, 4.8922],
        "things": [CAMERA, PERSON, ZONE, AREA, DEVICE],
    }
    args.update(over)
    return RedactContext(**args)  # type: ignore[arg-type]


def _redact(text: str, keep_names: bool = False, book: LabelBook | None = None) -> str:
    return redact_text(text, _context(), book or LabelBook(), keep_names=keep_names)


@pytest.mark.parametrize(
    ("text", "leak"),
    [
        pytest.param("password=correcthorse", "correcthorse", id="password"),
        pytest.param("token: abcdefgh12345", "abcdefgh12345", id="token"),
        pytest.param("api_key=K3yValue99", "K3yValue99", id="api_key"),
        pytest.param("Authorization: Bearer abcDEF123456", "abcDEF123456", id="bearer"),
        pytest.param("value hunter2-secret here", "hunter2-secret", id="secrets_yaml"),
        pytest.param("https://user:pa55@203.0.113.9/x", "pa55", id="url_sign_in"),
        pytest.param(
            "GET https://api.example.org/data?key=QwErTy123&x=1",
            "QwErTy123",
            id="query",
        ),
        pytest.param("connect to 192.0.2.15 failed", "192.0.2.15", id="ipv4"),
        pytest.param("peer 2001:db8::42 gone", "2001:db8::42", id="ipv6"),
        pytest.param("peer fe80::1%eth0 gone", "fe80::1", id="ipv6_scope"),
        pytest.param("mac AA:BB:CC:DD:EE:01 seen", "AA:BB:CC:DD:EE:01", id="mac"),
        pytest.param("mac aa-bb-cc-dd-ee-02 seen", "aa-bb-cc-dd-ee-02", id="mac_dash"),
        pytest.param("host homeserver is down", "homeserver", id="hostname"),
        pytest.param("see ha.example.net:8123", "ha.example.net", id="external_host"),
        pytest.param("printer.local timed out", "printer.local", id="local_name"),
        pytest.param("at 52.3731, 4.8922 now", "52.3731", id="coordinates"),
        pytest.param("lat 52.37 lon", "52.37", id="rounded_coordinate"),
        pytest.param("pair 48.85661,2.35222 here", "48.85661", id="unknown_pair"),
        pytest.param("Alex Moreau arrived", "Alex Moreau", id="person"),
        pytest.param("person.alex changed", "person.alex", id="person_id"),
        pytest.param("left Lakeside Cottage", "Lakeside Cottage", id="place"),
        pytest.param("file /home/alex/config", "alex", id="home_folder"),
        pytest.param(r"C:\Users\alex\x.log", "alex", id="windows_home"),
    ],
)
def test_every_group_is_hidden(text: str, leak: str) -> None:
    """Nothing in any promised group survives redaction."""
    assert leak not in _redact(text)
    # The relaxing switch never brings back anything but the names of things.
    assert leak not in _redact(text, keep_names=True)


def test_names_of_things_become_stable_labels() -> None:
    """The same thing gets the same label, in one send and across sends."""
    book = LabelBook()
    first = _redact("Front door offline; camera.front_door retry", book=book)
    assert first == "[camera 1] offline; [camera 1] retry"
    assert "[area 1]" in _redact("Garden shed light", book=book)
    restored = LabelBook.from_dict(book.as_dict())
    assert _redact("Front door again", book=restored) == "[camera 1] again"
    assert _redact("Hallway hub and Alex Moreau", book=restored) == (
        "[device 1] and [person 1]"
    )


def test_label_book_keeps_no_names() -> None:
    """Only hashes are stored, so the stored book reveals no name."""
    book = LabelBook()
    _redact("Front door and Alex Moreau", book=book)
    stored = str(book.as_dict())
    assert "front" not in stored.lower()
    assert "alex" not in stored.lower()


def test_keep_names_relaxes_only_things() -> None:
    """With the switch on, things stay readable; people and places do not."""
    text = "Front door, Garden shed, Alex Moreau, Lakeside Cottage, 192.0.2.4"
    result = _redact(text, keep_names=True)
    assert "Front door" in result
    assert "Garden shed" in result
    assert "Alex Moreau" not in result
    assert "Lakeside Cottage" not in result
    assert "192.0.2.4" not in result


def test_ordinary_text_survives() -> None:
    """Times, versions and plain words are not touched."""
    text = "Update took 18:52:01, build 2026.11.1.525, retry 14"
    assert _redact(text) == text


def test_longest_name_wins() -> None:
    """A longer name is replaced whole, not partly by a shorter one."""
    longer = NamedThing("camera.porch", "camera", ("Front door porch",))
    context = _context(things=[CAMERA, longer])
    result = redact_text("Front door porch moved", context, LabelBook())
    assert result == "[camera 1] moved"


def test_forbidden_value_left_in_text_fails_closed() -> None:
    """A value that must never leave makes the whole send fail."""
    with pytest.raises(RedactionError):
        redact_for_sending(
            {"latest.md": "my code is ghp_TOKENVALUE"},
            _context(),
            LabelBook(),
            forbidden=["ghp_TOKENVALUE"],
        )


def test_error_inside_redaction_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    """Any error while redacting is reported as RedactionError."""

    def boom(*_args: object, **_kwargs: object) -> str:
        raise ValueError("broken")

    monkeypatch.setattr(send_redact, "_hide_network", boom)
    with pytest.raises(RedactionError):
        redact_for_sending({"latest.md": "x"}, _context(), LabelBook())


def test_hidden_placeholder() -> None:
    """Addresses become the plain placeholder the preview shows."""
    assert _redact("address: 192.0.2.7") == f"address: {HIDDEN}"


# The names below are invented. The shapes follow lines seen in a real sent
# log, where names given to things had rewritten the names of programs.

PROGRAMS = ["sun", "weather", "todo", "update", "sensor", "recorder", "Sun"]
THINGS_NAMED_LIKE_PROGRAMS = [
    NamedThing(
        "device_tracker.homeassistant",
        "device_tracker",
        entity_names("device_tracker.homeassistant", "homeassistant"),
    ),
    NamedThing(
        "conversation.home_assistant",
        "conversation",
        entity_names("conversation.home_assistant", "Home Assistant"),
    ),
    NamedThing("sun.sun", "sun", entity_names("sun.sun", "Sun")),
    NamedThing(
        "weather.forecast_home",
        "weather",
        entity_names("weather.forecast_home", "Weather"),
    ),
    NamedThing("todo.shopping", "todo", entity_names("todo.shopping", "Todo")),
    NamedThing("update.firmware", "update", entity_names("update.firmware", "update")),
    NamedThing("sensor.plain", "sensor", entity_names("sensor.plain", "Sensor")),
    NamedThing("device:9", "device", ("device",)),
    NamedThing(
        "light.willow_lamp",
        "light",
        entity_names("light.willow_lamp", "Willow lamp"),
    ),
    NamedThing("person.rowan", "person", entity_names("person.rowan", "Rowan Ashby")),
]


def _program_context() -> RedactContext:
    return RedactContext(
        secrets=["fast", "Tr0ub4dor&3xyz"],
        hostnames=["homeassistant", "pi-cellar"],
        coordinates=[52.3731, 4.8922],
        things=THINGS_NAMED_LIKE_PROGRAMS,
        program_names=PROGRAMS,
    )


@pytest.mark.parametrize(
    ("text", "kept"),
    [
        pytest.param(
            "- Logger: homeassistant.components.recorder.db_schema",
            "homeassistant.components.recorder.db_schema",
            id="logger_line",
        ),
        pytest.param(
            "Error in homeassistant.helpers.entity while Willow lamp updated",
            "homeassistant.helpers.entity",
            id="logger_in_prose",
        ),
        pytest.param(
            "Installation: Home Assistant OS or Supervised",
            "Home Assistant OS or Supervised",
            id="product_name",
        ),
        pytest.param(
            "## Integrations set up\n\n- sun\n- weather\n- todo\n- update\n- sensor",
            "- sun\n- weather\n- todo\n- update\n- sensor",
            id="integration_list",
        ),
        pytest.param(
            "Setting up sun took longer than expected",
            "Setting up sun took",
            id="domain_in_prose",
        ),
        pytest.param(
            "device offline, update failed for Sensor",
            "device offline, update failed for Sensor",
            id="common_words",
        ),
        pytest.param(
            'File "/usr/local/lib/python3.14/site-packages/dbus_fast/aio/message_bus.py", line 42, in call',
            "dbus_fast/aio/message_bus.py",
            id="library_path",
        ),
        pytest.param(
            "dbus_fast.errors.DBusError: timeout",
            "dbus_fast.errors.DBusError",
            id="library_module",
        ),
        pytest.param(
            "## 2026-11-18 18:52 update",
            "## 2026-11-18 18:52 update",
            id="heading_domain",
        ),
    ],
)
def test_program_names_survive(text: str, kept: str) -> None:
    """Hiding names never rewrites the names of programs."""
    result = redact_text(text, _program_context(), LabelBook())
    assert kept in result
    assert "[device tracker" not in result
    assert "[conversation" not in result
    assert "[removed]" not in result


def test_given_names_still_hidden_beside_program_names() -> None:
    """Invented names, ids, addresses and secrets go; the logger stays."""
    text = (
        "homeassistant.components.light: Willow lamp at 192.0.2.44 refused "
        "light.willow_lamp for Rowan Ashby on pi-cellar with Tr0ub4dor&3xyz; "
        "token=ghp_INVENTED0123 at 52.3731, 4.8922"
    )
    result = redact_text(text, _program_context(), LabelBook())
    assert result.startswith("homeassistant.components.light: [light 1] at ")
    for leak in (
        "Willow lamp",
        "willow_lamp",
        "192.0.2.44",
        "Rowan Ashby",
        "pi-cellar",
        "Tr0ub4dor&3xyz",
        "ghp_INVENTED0123",
        "52.3731",
    ):
        assert leak not in result


def test_quoted_short_or_common_name_is_hidden() -> None:
    """A name that is an ordinary word is hidden where it stands as a name."""
    context = _program_context()
    context.things.append(NamedThing("switch.den", "switch", ("Den",)))
    result = redact_text(
        "changed 'Den' and friendly_name: Den; the den door", context, LabelBook()
    )
    assert result == "changed '[switch 1]' and friendly_name: [switch 1]; the den door"


@pytest.mark.parametrize(
    "dump",
    [
        pytest.param(
            "{'condition': 'state', 'entity_id': ['binary_sensor.maple_shed_window'], 'state': 'on'}",
            id="repr_list",
        ),
        pytest.param(
            'condition failed: {"entity_id": "binary_sensor.maple_shed_window"}',
            id="json",
        ),
        pytest.param(
            "entity_id: binary_sensor.maple_shed_window,lock.cellar_hatch",
            id="comma_list",
        ),
        pytest.param(
            "[binary_sensor.maple_shed_window, sensor.2nd_floor_cellar_hatch]",
            id="object_id_starts_with_digit",
        ),
    ],
)
def test_entity_ids_hidden_in_structured_text(dump: str) -> None:
    """Entity ids are labelled inside repr'd dicts and lists, known or not."""
    result = redact_text(dump, _program_context(), LabelBook())
    assert "maple_shed_window" not in result
    assert "cellar_hatch" not in result
    assert "[binary sensor 1]" in result


def test_entity_id_label_matches_its_names() -> None:
    """An entity id and its friendly name get the same label."""
    result = redact_text(
        "Willow lamp (light.willow_lamp) is off", _program_context(), LabelBook()
    )
    assert result == "[light 1] ([light 1]) is off"


def test_file_names_are_not_entity_ids() -> None:
    """A module file such as sensor.py keeps its name."""
    result = redact_text(
        "failed in sensor.py and update.json", _program_context(), LabelBook()
    )
    assert result == "failed in sensor.py and update.json"


def test_short_secret_inside_a_name_is_not_cut() -> None:
    """A short secret is hidden on its own, never inside a library name."""
    result = redact_text(
        "dbus_fast said the value fast", _program_context(), LabelBook()
    )
    assert result == "dbus_fast said the value [removed]"
    redact_for_sending({"latest.md": "dbus_fast only"}, _program_context(), LabelBook())


def test_hass_uuid_and_urls_stay_hidden() -> None:
    """Values hidden before stay hidden."""
    result = redact_text(
        "hass_uuid 0123456789abcdef0123456789abcdef at "
        "https://example.org/hook?key=QwErTy123",
        _program_context(),
        LabelBook(),
    )
    assert "0123456789abcdef0123456789abcdef" not in result
    assert "QwErTy123" not in result
    assert "[removed]" in result
    assert HIDDEN in result


def test_host_named_like_the_product_does_not_cut_loggers() -> None:
    """The default host name "homeassistant" leaves logger names whole."""
    result = redact_text(
        "homeassistant.components.recorder.core: slow, see homeassistant.local",
        _program_context(),
        LabelBook(),
    )
    assert result == f"homeassistant.components.recorder.core: slow, see {HIDDEN}"
