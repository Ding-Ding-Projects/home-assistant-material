# Schedules and shared defaults for personal settings

Status: built, not yet seen in a running build. Board `Schedule` is partly built: time rules are
in; triggers from an entity or a web service are not.

## Schedules

A rule says "between these times on these days, this preference has this value". Rules are checked
top to bottom and the first one that applies to a preference wins. Evaluating the rules never
writes the stored choice: it produces an overlay laid over the stored choices, below School mode,
so the stored choice is back as soon as no rule applies.

- Schedulable preferences are the ones with a real consumer today: language mode, low stimulation,
  sound effects, dialog emoji, one thing at a time, focus spotlight, time awareness, momentum and
  the narrator.
- Times are 24-hour `HH:MM`; an end before the start runs into the next day. Up to 30 rules.
- Code: `frontend/src/common/preferences/preference-schedule.ts` (pure logic),
  `preference-schedule-store.ts` (storage and clock), and the editor at
  `frontend/src/panels/config/personal/ha-personal-schedules.ts`.

## Shared defaults

An administrator can set defaults for everyone on the instance. They are only defaults: a choice a
person made in this browser always wins, and one reset goes back to the shared default. Every value
that arrives is validated field by field before use, and the last good answer is cached in this
browser so it applies before the connection is up. Stored as instance system data under
`preferenceDefaults`.

- Code: `frontend/src/common/preferences/shared-preference-defaults.ts` and
  `frontend/src/panels/config/personal/ha-personal-shared-defaults.ts`.

## Failure modes

An invalid rule or default is ignored, not applied partly. A missing connection leaves the cached
defaults in force.

## How it was checked

Unit tests (`preference-schedule.test.ts`, `shared-preference-defaults.test.ts`) pass. The editors
were not opened in a browser, and no schedule has been watched switching a setting at its time.
