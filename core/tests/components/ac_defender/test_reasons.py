"""Reason codes and guard descriptions must have wording in both languages."""

import json
from pathlib import Path
import re

import pytest

from homeassistant.components.ac_defender import descriptions, guards
from homeassistant.components.ac_defender.pipeline import decide
from homeassistant.components.ac_defender.reasons import TEMPLATES, Reason

from .common import make, only, run, touch

ROOT = Path(__file__).parents[4]

COMPONENT = ROOT / "core/homeassistant/components/ac_defender"
TRANSLATIONS = ROOT / "frontend/src/translations"
PLACEHOLDER = re.compile(r"\{(\w+)")


def wording(file: str) -> dict:
    """Return the defenders block of a frontend translation file."""
    data = json.loads((TRANSLATIONS / file).read_text(encoding="utf8"))
    return data["ui"]["panel"]["config"]["defenders"]


@pytest.fixture(params=["en.json", "yue-own.json"])
def block(request: pytest.FixtureRequest) -> dict:
    """Return the wording of one language."""
    if not TRANSLATIONS.exists():
        pytest.skip("the frontend wording is not part of this checkout")
    return wording(request.param)


def test_every_reason_code_has_wording_in_both_languages(block: dict) -> None:
    """A new reason code without wording on the page fails here."""
    missing = sorted(set(TEMPLATES) - set(block["reason"]))
    assert missing == []
    stale = sorted(set(block["reason"]) - set(TEMPLATES))
    assert stale == []


def test_wording_uses_the_values_of_its_code(block: dict) -> None:
    """The page wording may only use the values the engine sends."""
    for code, template in TEMPLATES.items():
        sent = set(PLACEHOLDER.findall(template))
        used = set(PLACEHOLDER.findall(block["reason"][code]))
        assert used <= sent, code


def source_codes() -> set[str]:
    """Return every reason code written in the engine."""
    found: set[str] = set()
    for path in [*COMPONENT.glob("*.py"), *(COMPONENT / "guards").glob("*.py")]:
        if path.name == "reasons.py":
            continue
        found |= set(re.findall(r'Reason\(\s*"(\w+)"', path.read_text(encoding="utf8")))
    return found


def test_every_code_in_the_engine_is_registered() -> None:
    """Writing Reason with an unknown code is caught before it runs."""
    assert sorted(source_codes() - set(TEMPLATES)) == []


def test_the_registered_codes_are_all_used() -> None:
    """A registered code that nothing produces is stale wording."""
    dynamic = {
        "emergency_too_cold",
        "emergency_someone_upset",
        "emergency_suspicion_quiet",
        "restoring_cool_mode_firmly",
        "restoring_my_temperature_firmly",
        "heat_has_room",
    }
    assert sorted(set(TEMPLATES) - source_codes() - dynamic) == []


def test_no_engine_reason_is_a_bare_string() -> None:
    """Reasons are built with Reason, never written as plain text."""
    pattern = re.compile(
        r'(reason\s*=\s*f?"|reason_text\s*=\s*f?"|hold_for\([^()]*,\s*f?")'
    )
    offenders = []
    for path in [COMPONENT / "pipeline.py", *(COMPONENT / "guards").glob("*.py")]:
        for number, line in enumerate(
            path.read_text(encoding="utf8").splitlines(), start=1
        ):
            if pattern.search(line):
                offenders.append(f"{path.name}:{number}")
    assert offenders == []


def test_every_guard_text_is_a_reason() -> None:
    """The fixed wait text of every hold guard carries its code."""
    for cls in guards.ALL_GUARD_CLASSES:
        text = getattr(cls, "reason_text", None)
        if text is not None:
            assert isinstance(text, Reason), cls.__name__


def test_a_reason_keeps_its_english_text_and_its_values() -> None:
    """The text stays plain English; the code and values go beside it."""
    reason = Reason("below_floor", room=15.0, floor=16.0)
    assert reason == (
        "the room is at 15.0 degrees, below the floor of 16.0: heating is allowed"
    )
    assert reason.to_dict() == {
        "code": "below_floor",
        "params": {"room": 15.0, "floor": 16.0},
    }


def test_a_reason_with_a_reason_inside_is_expanded() -> None:
    """A holding line names why it holds, and both travel together."""
    inner = Reason("walking_back", step=0.5)
    outer = Reason("holding_target_because", target=23.0, because=inner)
    assert outer == "holding 23.0: walking back 0.5 degrees"
    assert outer.to_dict()["params"]["because"] == {
        "code": "walking_back",
        "params": {"step": 0.5},
    }


def test_the_decision_of_the_pipeline_carries_a_code() -> None:
    """Real decisions give the page a code to word."""
    decision, _ = run("heat", keys=(), floor=16.0, room=15.0, setpoint=17.0)
    assert decision.reason.code == "below_floor"
    hold, _ = run(
        keys=("natural_walkback",),
        room=24.0,
        setpoint=27.0,
        touches=[touch(5, 23.0, 25.0), touch(2, 25.0, 27.0)],
    )
    assert hold.reason.code in TEMPLATES


def test_a_stepping_decision_names_what_shaped_it() -> None:
    """A correction shows the guard that shaped it, as a nested reason."""
    options = only("natural_walkback")
    options["guards"]["natural_walkback"]["settings"] = {"step": 1.0, "jitter": 0.0}
    ctx, guards = make(
        options=options,
        room=23.5,
        setpoint=27.0,
        touches=[touch(5, 23.0, 25.0), touch(2, 25.0, 27.0)],
    )
    decision = decide(ctx, guards)
    assert decision.action == "set_temperature"
    assert decision.reason.code == "holding_target_because"
    assert decision.reason.to_dict()["params"]["because"]["code"] == "walking_back"


def test_every_guard_has_a_description_in_both_languages(block: dict) -> None:
    """All 51 guards have one line in English, Cantonese and the Core entities."""
    ids = {cls.spec.key for cls in guards.ALL_GUARD_CLASSES}
    assert len(ids) == 51
    assert set(descriptions.GUARD_DESCRIPTIONS) == ids
    assert set(block["guard_desc"]) == ids
    assert set(block["guard_desc_heat"]) == set(descriptions.HEAT_GUARD_DESCRIPTIONS)
    assert set(descriptions.HEAT_GUARD_DESCRIPTIONS) <= ids


def test_a_description_is_one_short_line() -> None:
    """Descriptions are one line each."""
    for text in descriptions.GUARD_DESCRIPTIONS.values():
        assert "\n" not in text
        assert len(text) <= 110


def test_the_guard_options_of_the_setup_step_carry_the_description() -> None:
    """The setup guards step shows each guard with its description."""
    for domain in ("ac_defender", "heat_defender"):
        path = ROOT / f"core/homeassistant/components/{domain}/strings.json"
        options = json.loads(path.read_text(encoding="utf8"))["selector"]["guard"][
            "options"
        ]
        for key, label in options.items():
            assert ": " in label, (domain, key)


def test_the_context_default_courtesy_wait_is_ten_minutes() -> None:
    """The courtesy wait before turning manual heating off defaults to ten minutes."""
    ctx, _ = make("heat")
    assert ctx.courtesy_wait_seconds == 600.0
