# AC Defender

AC Defender keeps cooling on the way it was set. When something turns the unit off or changes its
setting, the defender puts it back, within guards that stop it from fighting people or wearing the
unit out.

## Setting it up

Settings, Devices and services, Add integration, AC Defender. The setup flow picks the units to
look after. Setup pickers that listed nothing were fixed in `b62a3e0ef` so that they now list the
units, and numbers are sliders.

## What you get

- One device, with a switch per guard.
- Its own page with four parts: Now, Guards, Cost and Log. The page says what it is doing and why,
  and shows the comfort band bar and, when a sister is looking after the same unit, that sibling on
  top (see [`shared-band-and-handovers.md`](shared-band-and-handovers.md)).
- A link from each device to its page, and plain messages instead of raw errors when a band is
  wrong.
- Services for pausing and stopping everything, and buttons, numbers, selects, sensors and an
  event entity for the log.

## The engine

- 51 guards, each a small class behind one interface, in `ac_defender/guards/`.
- Direction-aware: the same engine holds cooling on or heating off.
- A cost model that shows time only unless the owner supplies a power figure.
- Numbers corrected from the reference program (`d78560d34`): direct cooling at target plus 2.0,
  touch and command pressure, the governor score, and parking at 28.0. Each number has a test; three
  were watched failing with the old values (`32949f117`).

## Remembering across a restart

A pause, "stop everything", today's running time and cost, who holds the room and the last hundred
log lines are saved and read back. After a restart the defenders keep their hands off the unit
until a fresh reading arrives, so a burst of commands is not sent on startup. A pause given right
after a restart was being lost and is saved since `b62a3e0ef`.

## Failure modes (inferred from the design, not read from a commit record)

- No fresh reading after a restart: the defender waits and does nothing.
- A guard that cannot read what it needs does not act.
- With no power figure supplied, the Cost tab shows time only and no money figure.

## Security and safety

The defender only changes the units the owner chose in setup, and every guard has its own switch.

## How it was verified

- Engine: 76 tests (`a5bbfa5da`); a test for each number taken from the reference program.
- First run in a real Home Assistant instance (`b62a3e0ef`): the setup pickers, sliders, the pause
  after a restart, the settings rows and the band bar were seen working. The same run caught the
  sibling quarrel described in the shared band file.
- Not seen against a real air conditioner; the cost figures were not checked against real power use.
