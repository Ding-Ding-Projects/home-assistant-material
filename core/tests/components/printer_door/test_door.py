"""Tests for the door and print-state decoding."""

import pytest

from homeassistant.components.printer_door.door import read_doors, read_status

from .conftest import DOOR_CLOSED, DOOR_OPEN, DOOR_SUPPORTED


@pytest.mark.parametrize(
    ("print_data", "supported", "doors"),
    [
        pytest.param(
            {"stat": DOOR_OPEN, "fun": DOOR_SUPPORTED},
            True,
            {"front": True, "top": False, "left": False, "right": False},
            id="front_open",
        ),
        pytest.param(
            {"stat": DOOR_CLOSED, "fun": "0"},
            False,
            {"front": False, "top": False, "left": False, "right": False},
            id="no_door_detection",
        ),
        pytest.param(
            {"stat": format(1 << 24 | 1 << 26, "x")},
            None,
            {"front": False, "top": True, "left": False, "right": True},
            id="top_and_right_open",
        ),
        pytest.param(
            {"home_flag": 1 << 23},
            None,
            {"front": True},
            id="older_report_front_door",
        ),
        pytest.param({"stat": "not hex"}, None, {}, id="invalid_stat"),
        pytest.param({"gcode_state": "RUNNING"}, None, {}, id="no_door_fields"),
    ],
)
def test_read_doors(
    print_data: dict[str, object], supported: bool | None, doors: dict[str, bool]
) -> None:
    """Doors are decoded from the stat bits, or the older home flag."""
    assert read_doors(print_data) == (supported, doors)


@pytest.mark.parametrize(
    ("gcode_state", "status"),
    [
        ("IDLE", "idle"),
        ("RUNNING", "printing"),
        ("PREPARE", "printing"),
        ("PAUSE", "paused"),
        ("FINISH", "finished"),
        ("FAILED", "failed"),
        ("SOMETHING_NEW", None),
        (None, None),
    ],
)
def test_read_status(gcode_state: str | None, status: str | None) -> None:
    """The printer's G-code state maps to a print status."""
    assert read_status(gcode_state) == status
