# Grow light

A helper that keeps a plug on for a set number of hours each day and switches it off while a door
is open.

Add it from **Settings > Devices & services > Helpers > Create helper > Grow light**. Boards:
[`design/canvases/43-grow-light`](../../../design/canvases/43-grow-light/README.md).

## Settings

| Setting | What it does |
| --- | --- |
| Name | The name of the grow light and its entities. |
| Plug or switch | The `switch`, `light` or `input_boolean` that powers the light. |
| Start time | When the light turns on each day. |
| Hours per day | How long it stays on, from 0.5 to 24 hours in half-hour steps. A window that passes midnight works, for example 20:00 for 8 hours ends at 04:00. 24 means always on. |
| Pause when open | Optional door or window sensors (`binary_sensor`). |

All of them except the name can be changed later from the helper's **Options**; the helper reloads
with the new settings.

## How it behaves

- Inside the on hours, with every door closed, the plug is turned on.
- When the on hours end, the plug is turned off.
- When any listed door opens (its state is `on`), the plug is turned off at once.
- When the last open door closes, the plug is turned back on **only if it is still inside the on
  hours**. Closing a door outside the on hours leaves the light off.
- The helper only switches the plug when something changes: the on hours start or end, a door
  opens or closes, the schedule switch changes, Home Assistant starts, or the plug comes back
  online after being unavailable. Switching the plug by hand is left alone until the next change.
- A door that is `unavailable` or `unknown` counts as closed.

## Entities

| Entity | What it shows |
| --- | --- |
| Switch **Schedule** | Turns the helper on or off. Turning it off switches the plug off and stops all automatic switching until it is turned on again. Its state is kept across restarts. |
| Sensor **Status** | `on`, `paused` (a door is open), `off_hours` or `schedule_off`. The `open_doors` attribute lists the doors open now. |
| Sensor **Next change** | When the on hours next start or end. Empty while the schedule is off or when the light is on all day. |

## Verification

- `tests/components/grow_light/test_schedule.py`: the on-hours window, including across midnight;
  15 cases, passed when run directly on 23 November 2026.
- `tests/components/grow_light/test_init.py` and `test_config_flow.py`: start-up, door pause and
  resume, door closed outside the hours, end of the window, schedule switch off, and the setup
  step. These need the Linux test environment; see `ROADMAP.md` for whether they have run.
- Not yet seen in a running build with a real plug and door sensor.
