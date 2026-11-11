# Schedules and shared defaults for personal settings

Status: built, not yet seen in a running build. Board `Schedule` is partly built: time rules are
in, and so are conditions on an entity's state; triggers from a web service are not.

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

### Rules that depend on an entity

A rule can also depend on the state of a Home Assistant entity, on top of or instead of its time
window. In the editor, "Only at certain times" (on by default) and "Depends on an entity" (off by
default) are two switches; at least one must be on.

- Comparisons: the entity **is** one of up to 10 listed states, **is not** any of them, **is
  above** a number, or **is below** a number. State text is compared without regard to case or
  surrounding spaces. A number comparison reads the state as a plain decimal number (optionally
  with an exponent); anything else, such as `abc`, `0x10` or `Infinity`, does not hold.
- A rule with both a time window and an entity applies only while both hold. An entity-only rule
  has no time window and applies whenever the entity condition holds.
- An entity that is missing, `unavailable` or `unknown` makes the condition false for every
  comparison, including "is not". The rule list then says "Not applying: <entity> cannot be read"
  beside the rule, and the editor says the same under the entity.
- The priority order is unchanged: the first rule that applies to a setting wins, School mode wins
  over every rule, and a rule never changes the person's own choice.
- The rule list reads the condition in words with the entity's friendly name, for example "Low
  stimulation is On, every day, all day, while Living room TV is on". The "Applying now" and "In
  effect now" lines account for the condition.
- "Next change" only looks at the clock and assumes every entity keeps its current state. For an
  entity-only rule there is never a next change to show.

How it re-evaluates: no new websocket subscription and no polling. The sidebar, which is always
mounted, hands `hass.states` to the schedule store on each change. The store looks only at the
entities that enabled rules name (the stored text is parsed again only when it changed) and wakes
the preference subscribers only when one of those states changed; they then apply the result only
when the overlay actually changed. The clock tick is unchanged. Nothing leaves the instance.

Storage: `preferenceSchedules` is unchanged and gains two optional fields on a rule: `condition`
(`entityId`, `comparison`, `states` or `threshold`) and `timed` (written only as `false` for an
entity-only rule). A rule stored by an older build reads exactly as before. Everything read from
storage is validated: entity ids must look like `domain.object_id` (at most 255 characters),
states are trimmed, limited to 64 characters each and 10 per rule, thresholds must be finite
numbers, and an entity-only rule without a valid condition is dropped. An invalid condition is
dropped and the time rule is kept. Limits: an older build ignores the condition, so it would apply
an entity-only rule all day; the stored `from`, `to` and `days` of such a rule are all day, every
day.

Code: conditions and evaluation in `preference-schedule.ts`, the state feed in
`preference-schedule-store.ts` (`setScheduleEntityStates`), the call in `ha-sidebar.ts`.

Not done: "for at least N minutes", conditions on an attribute, and combining several entities in
one rule (use several rules; the first that applies wins).

## Shared defaults

An administrator can set defaults for everyone on the instance. They are only defaults: a choice a
person made in this browser always wins, and one reset goes back to the shared default. Every value
that arrives is validated field by field before use, and the last good answer is cached in this
browser so it applies before the connection is up. Stored as instance system data under
`preferenceDefaults`.

- Code: `frontend/src/common/preferences/shared-preference-defaults.ts` and
  `frontend/src/panels/config/personal/ha-personal-shared-defaults.ts`.

## Schedule rules are saved with the account

The list of rules (`preferenceSchedules`) is saved on the instance with the account and follows
the person to every device (see `docs/features/instance-sync/README.md`). A build from before the
entity condition existed ignores `condition` and `timed`: it reads such a rule as a plain clock
rule, and any save it makes writes the list back without the condition for every device. All
devices that use one account should run the same build; reload old tabs after an update. A rule
"is unavailable" can never fire, because a missing, `unavailable` or `unknown` state never holds.

## Failure modes

An invalid rule or default is ignored, not applied partly. A missing connection leaves the cached
defaults in force.

## How it was checked

Unit tests (`preference-schedule.test.ts`, `preference-schedule-entity.test.ts`,
`shared-preference-defaults.test.ts`) pass. The entity tests cover each comparison, missing and
unavailable entities, non-numeric states, time plus entity, hostile stored rules, an old stored
rule, and the exact set of watched entities. The editors were not opened in a browser, the entity
picker, select and time inputs were not seen rendering, and no schedule has been watched switching
a setting at its time or when an entity changed.
