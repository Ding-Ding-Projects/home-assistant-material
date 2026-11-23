# Canvas 43: grow light

Boards for the Grow light helper (23 November 2026). The helper is built from these boards.

| Board | Size | What it shows |
| --- | --- | --- |
| `Main.dc.html` | Phone, 390 px | The grow light's card: light now, the paused banner while a door is open, the on-hours bar with a now marker, the next change, the Schedule switch. The door and time buttons are a working demo. |
| `Setup.dc.html` | Phone, 390 px | The "Add grow light" step: name, plug or switch, start time, hours per day, door sensors. |
| `Desktop.dc.html` | PC screen, 1280 px, fluid | The same grow light on a wide screen: status tiles, a 24-hour bar with the paused stretch, a recent changes list, settings beside it. Below about 900 px the settings move under the main column. |

Not built yet: the "Light today" total and the recent changes list on the PC board need history
reading, which the helper does not do yet. Everything else on the boards is the helper's own
entities (Schedule switch, Status sensor, Next change sensor) and its setup and options steps.

Every board has the same two Tweaks: the accent colour and a motion switch. Reduced motion stops
the pulse on the "On" state whatever the switch says.
