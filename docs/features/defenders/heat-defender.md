# Heat Defender

Heat Defender is the sister of AC Defender. Where that one keeps cooling on, this one keeps the
heating off, or no warmer than a chosen number, so the home does not get hot. It is set up from
Add integration, gets one device with a switch per guard, and has its own page with Now, Guards,
Cost and Log.

## The floor, which is not negotiable

Comfort never outranks pipes or people. Below the floor the heating is allowed to run whatever
anyone chose.

- Nothing under 10 degrees can be set through the setup flow, the options, the number entity, the
  websocket or a stored value.
- Heating is always allowed below the floor; it cannot be switched off there.
- Freezing weather outside raises the floor.
- With no room reading, the defender stands down.

These rules live in the shared engine and have tests; the floor values were checked through each
route listed (`d78560d34`, `32949f117`).

## What it does to the unit

After the first real run (`b62a3e0ef`) it only ever restores "off", or its own cap while the room
is under it, and it never touches cooling. Someone who turns the heating on by hand gets a courtesy wait before it is turned off again.
The wait is a setting, 0 to 30 minutes with 10 as the default; zero turns it off at once (`7cd4d5189`).
The wait was first ignored whenever the mode guard was on, and is now the only wait (`090bf8e62`).
Below her floor a unit that is cooling is now switched over to heat; before, she never did that
(found by the whole-day test, see
[`guard-descriptions-and-reasons.md`](guard-descriptions-and-reasons.md)).

## Remembering across a restart

Same as AC Defender: pause, stop everything, running time and cost, who holds the room and the
last hundred log lines are saved; after a restart it waits for a fresh reading.

## Failure modes (inferred from the design, not read from a commit record)

- No room temperature reading: stands down and does nothing.
- A restored cap while the room is above it is not applied.

## How it was verified

- Engine tests include the heat safety rules (a floor that cannot go under 10, always allowed
  below it, a higher floor in freezing weather, stand down with no reading).
- First run in a real Home Assistant instance: the sibling quarrel was seen and fixed, and the
  band bar showing her floor, the shared band and the safety mark was seen on the page.
- Seen in a real run on build 523 (a test unit, not a real heater): switching a cooling unit to heat below her floor, the courtesy wait at zero turning the heating off within two seconds, and a pause surviving a restart.
- Never run on a real heater. A real floor, real freezing weather and real heat flow are unproven.
