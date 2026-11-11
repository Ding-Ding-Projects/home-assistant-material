# Entity dialogs

Code: `frontend/src/dialogs/more-info/` (`controls/`, `components/`, `more-info-control-style.ts`,
`more-info-board-style.ts`).

## What it does

35 of the 36 entity dialogs are redrawn to their boards: climate, cover, counter, lock, alarm,
camera, media player, vacuum, fan, light, weather, sensor, update, person, timer, humidifier,
water heater, valve, date, time, date and time, sun, image, calendar, setup step, default,
siren, lawn mower, remote, group, automation, script and conversation. Each has a tab row and a
tools block (lock, appearance, read aloud, export), shows the state once, and no longer repeats
the page lock and appearance tools. The shared state controls for alarm, climate, lock, fan,
vacuum and water heater follow the boards behind an opt-in.

Group dialogs ask before switching covers, locks or valves. The image dialog has no share
button, because the shared address carried an access code. Date, time and calendar dialogs
follow the time zone chosen in the profile; the time dialog has spin controls and the date grid
can be walked with the arrow keys.

## Open findings

Water heater switch name, state shown by colour alone on humidifier, weather unit at 320 px,
sensor attributes, and a numeric sensor that still shows two charts.

## Verification

The row of tools in an entity dialog was seen in a running build (build 38). The redrawn dialogs
are checked by lint, the type check and unit tests only.
