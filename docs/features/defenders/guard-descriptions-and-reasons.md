# Guard descriptions, reason codes and the courtesy wait

Commits `7cd4d5189` (guard descriptions, reasons, courtesy wait, the whole-day test), `ecc3e18ef`
and `090bf8e62` (faults found in a browser and a real instance).

Code: `core/homeassistant/components/ac_defender/reasons.py`,
`core/homeassistant/components/ac_defender/guards/`,
`core/homeassistant/components/heat_defender/config_flow.py`,
`frontend/src/data/defenders.ts`, `frontend/src/panels/config/ac-defender/ha-defender-page.ts`.

## Each guard says what it does

Each of the 51 guards has a one-line description. Before, a guard was a name on a switch. The
guard names and the logged actions also have Cantonese (`02dd3f9b4`).

## Reasons are codes, worded by the page

The engine now reports a reason as a code with a few numbers (for example "below the floor" with
the room temperature and the floor). The page words it in English and Cantonese from the code.
A test fails when a code has no wording in either language. A restored pause used to lose its
reason code, so its line stayed in English; it keeps it now (`ecc3e18ef`).

## Other changes in `7cd4d5189`

- The sibling row has an Open link to the other defender's page.
- **The courtesy wait is a setting** on Heat Defender: 0 to 30 minutes, default 10. When someone
  turns the heating on by hand it is left on that many minutes before being turned off again.
  Zero turns it off at once.
- Setup waits for the climate entity to exist before it starts working.
- The defender's entities go unavailable when the unit goes unavailable.
- The retention of touches and commands follows the reference program.

## Two faults found by a whole-day test

A test (`heat_defender/test_day_walk.py`, 271 lines) plays a whole day with both defenders on one
unit, against a pretend unit that obeys commands. It found two real faults, both fixed:

1. When the room fell below Heat Defender's floor, and the unit was cooling, she never switched it
   over to heat. Fixed so that below the floor a cooling unit is switched to heat.
2. The shared log announced that AC Defender had stopped when it was not running at all.

## Faults found in a real instance (`090bf8e62`)

The courtesy wait setting was ignored whenever the heating's mode guard was on: that guard turned
the heating off after its own short pause, so "ten minutes" meant about half a minute. The
courtesy wait is now the only wait, and zero means at once.

## The log words its actions (`6db767de3`, on main, not built)

The defender log used to show raw engine names with underscores replaced by spaces. Action names
are now tidy sentence-case phrases (`comfort_sync`, `comfort-sync` and `comfortSync` all read
"Comfort sync"), and the value a logged command set reads as a number when it is one and as a
tidied word otherwise (`readableName` and `commandValueText` in `frontend/src/data/defenders.ts`).
Unit-tested in `frontend/test/data/defenders.test.ts`; not seen in a browser.

## Failure modes

- A reason code with no wording fails a test and, until fixed, would show as a readable sentence,
  not a raw code (inferred from the design; not read from a record).
- No fresh reading after a restart: the defenders wait, as before.

## Verification

- Python tests: `test_reasons.py`, `test_reference_numbers.py`, `test_init.py`, `test_day_walk.py`
  and the frontend `defenders-wording.test.ts` and `defenders.test.ts`.
- **Seen in a real run on build 523 (a test unit, not a real air conditioner or heater):** Heat
  Defender switching a cooling unit to heat below her floor; the courtesy wait at zero turning the
  heating off within two seconds; a pause surviving a restart.
- Not seen: the Cantonese reasons rendered in a browser at the time of `7cd4d5189`; any real unit.
- **Finish work in `a3cb56d37`:** the quality scale files of both defenders mark the flow tests,
  disabled-by-default sensors, translated validation errors and repair issues as done (every step,
  abort and error of the config, reconfigure and options flows tested; 100 percent line coverage of
  both config flow modules and 91 percent for both integrations together, with the guard modules
  below 95 percent). Cool outdoor shutdown sends an off command again when it never went out
  (`test_cool_outdoor.py`); quality tests were added and the persistence tests extended. A code owner still needs the
  maintainer's account name.
- **Integration look of 18 November, on a local build of the tree (not a released build), 390 px,
  dark, both-language mode:** AC Defender and Heat Defender were set up on a test climate entity
  through the config flow. The device page groups the guard switches by family ("Money: Cool
  outdoor shutdown", "People: Comfort memory" and so on), and both Now pages opened without cut text
  or errors. Not seen: the reason line in both languages, a nested reason, pause, restart, a
  restored pause reason, and the log wording of `6db767de3`. A release for `a3cb56d37` was
  dispatched and is not yet verified.
- Not proven: every command a defender sends to real hardware, the heating floor in real cold
  weather, cost figures against real power use, and a real air conditioner and heater sharing one
  unit. Only the owner can prove these.

### Cool-outdoor shutdown and hourly weather

When forecast checking is enabled, select an outdoor **weather** entity that supplies hourly
forecasts. A temperature sensor alone cannot supply the forecast. The local repair reads
hourly values through Home Assistant's weather service and converts temperatures to Celsius.
It requires a valid reading in every hour of the configured lookahead. A missing, expired or
incomplete forecast leaves shutdown ineligible. The coordinator refreshes at most once every
15 minutes for the same provider and clears old readings when the source changes or is unavailable.

An off decision that never reached the actuator is checked again against the current room,
outdoor and forecast conditions. A synthetic service test confirmed a retry when the actuator
returned and the conditions still qualified. A forecast warming from 17 °C to 27 °C withdrew
the unsent decision. Existing dwell and manual-override handling still apply after a command is
sent. No physical air conditioner was exercised.
