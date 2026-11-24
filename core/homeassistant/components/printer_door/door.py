"""Door and print-state decoding for Bambu Lab printer reports.

The printer reports its door sensors in ``print.stat``, a hexadecimal string whose
bits 23 to 26 are the front door, the top cover, the left door and the right door.
Older reports carry the front door in bit 23 of ``print.home_flag`` instead. Bit 12
of ``print.fun`` says whether the printer has door detection at all. This is the
decoding Bambu Studio uses; the printer maker does not document it.
"""

from typing import Any

from .const import (
    STATUS_FAILED,
    STATUS_FINISHED,
    STATUS_IDLE,
    STATUS_PAUSED,
    STATUS_PRINTING,
)

DOOR_BITS = {"front": 23, "top": 24, "left": 25, "right": 26}

GCODE_STATE_TO_STATUS = {
    "IDLE": STATUS_IDLE,
    "INIT": STATUS_IDLE,
    "PREPARE": STATUS_PRINTING,
    "SLICING": STATUS_PRINTING,
    "RUNNING": STATUS_PRINTING,
    "PAUSE": STATUS_PAUSED,
    "FINISH": STATUS_FINISHED,
    "FAILED": STATUS_FAILED,
}


def _hex_bit(value: Any, bit: int) -> int | None:
    """Return one bit of a hexadecimal string, or None when it is not one."""
    if not isinstance(value, str) or not value:
        return None
    try:
        number = int(value, 16)
    except ValueError:
        return None
    return (number >> bit) & 1


def read_doors(print_data: dict[str, Any]) -> tuple[bool | None, dict[str, bool]]:
    """Decode one report.

    Returns whether door detection is supported (None when unknown) and the doors
    this report says something about.
    """
    supported: bool | None = None
    doors: dict[str, bool] = {}
    if (fun := _hex_bit(print_data.get("fun"), 12)) is not None:
        supported = fun == 1
    if _hex_bit(print_data.get("stat"), 0) is not None:
        for door, bit in DOOR_BITS.items():
            doors[door] = _hex_bit(print_data["stat"], bit) == 1
    else:
        home_flag = print_data.get("home_flag")
        if isinstance(home_flag, int) and not isinstance(home_flag, bool):
            doors["front"] = ((home_flag >> 23) & 1) == 1
    return supported, doors


def read_status(gcode_state: Any) -> str | None:
    """Map the printer's gcode_state to a print status, or None when unknown."""
    if not isinstance(gcode_state, str):
        return None
    return GCODE_STATE_TO_STATUS.get(gcode_state.upper())
