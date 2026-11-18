# AC Defender and Heat Defender

Two integrations that look after a climate unit so a home does not get hot or cold by accident.

| File | Feature | State (see `../../feature-status.md`) |
| --- | --- | --- |
| [`ac-defender.md`](ac-defender.md) | AC Defender: keeps cooling running the way it was set | Seen in a real instance (not against a real unit) |
| [`heat-defender.md`](heat-defender.md) | Heat Defender: keeps heating off, or no warmer than a chosen number, with a safety floor | Seen in a real instance (not against a real unit) |
| [`guard-descriptions-and-reasons.md`](guard-descriptions-and-reasons.md) | A one-line description for each of the 51 guards, reasons worded in two languages from codes, the courtesy wait setting, and two faults found by a whole-day test | Python and frontend tests; the courtesy wait, the below-floor switch to heat and pause across a restart seen in a real run of build 523 (a test unit) |
| [`shared-band-and-handovers.md`](shared-band-and-handovers.md) | When both look after the same unit: one comfort band, handovers, one log | Seen in a real instance once; the quarrel it showed was fixed |

Code: `core/homeassistant/components/ac_defender/` (including the `guards/` folder, the pipeline,
the arbiter and the sibling logic) and `core/homeassistant/components/heat_defender/`. Frontend:
`frontend/src/panels/config/ac-defender/`, `frontend/src/panels/config/heat-defender/`,
`frontend/src/data/defenders.ts`, and action editors under
`frontend/src/components/action-editors/domains/integrations/`. Design: canvas 39
(`design/canvases/39-ac-defender`).

## History

1. `a5bbfa5da`: the decision engine, ported from a separate program, with no manifest so nothing
   was loadable.
2. `d78560d34`: the two integrations around the engine (setup, entities, services, pages).
3. `32949f117`: state kept across a restart, and a test for each number taken from the reference
   program.
4. `b62a3e0ef`: first run in a real instance, which found the two arguing over the thermostat.
5. `7cd4d5189`, `ecc3e18ef`, `090bf8e62`: guard descriptions, reasons in two languages, the courtesy wait setting, two faults found by the whole-day test and one more found in a real instance.

## What has not been proven

On build 523 a real run used a test unit: the below-floor switch to heat, the courtesy wait at zero and a pause across a restart were seen. Nothing has been run against a real air conditioner or heater, so the commands each defender
sends, the reaction of a real unit and the cost figures are unproven. The engine's numbers come
from the reference program's catalogue and defaults; its long decision code was not read line by
line. The quality scale files are filled in honestly, which means the Bronze level is not reached
yet.
