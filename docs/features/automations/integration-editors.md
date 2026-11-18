# Tailored editors for integration actions, triggers, conditions and device automations

Every action, trigger, condition and device automation that an integration defines gets controls
chosen for its fields, instead of a generic text box. Design: canvas 37
(`design/canvases/37-integration-editors`) and canvas 38 for the entity kinds.

Code: `frontend/src/components/action-editors/` (with `descriptors.ts` and the per-integration files
under `domains/integrations/`). Commits: `0e32f6ee9`, `a48fc170f`, `991e35fbc`, `900ceccca`.

## What exists

| Part | Coverage |
| --- | --- |
| Actions | 286 integrations registered, none claimed twice; about 896 actions with about 2,300 fields written by hand in six files split by letter |
| Triggers | 51 integrations, 202 triggers, 384 fields |
| Conditions | 43 integrations, 161 conditions, 340 fields |
| Device automations | 77 source files across 46 integrations |
| Community Bambu Lab printer integration | 15 actions and 37 fields |

The Bambu Lab integration is not part of Core, but many homes run it as a custom integration.
Its editors have axis tiles with a travel slider, drying temperature and hours within the
dryer's limits, a plate stepper for print jobs, filament profile and material lists, and raw
G-code kept as a clearly warned last resort. It was studied read-only at an upstream commit under
the MIT licence and none of its code was run. Still missing a proper control: tray tiles with a
colour swatch, a colour picker that stores the printer's text colour format, and a file picker for
the job.

## How controls are chosen

- Bounded numbers are sliders or steppers, colours use the colour picker, durations and times use
  their own controls, passwords and codes are hidden, and risky actions carry a caution.
- Long forms fold optional fields into "More options (N)". Two or more unset switches fold there
  too.
- Free-form dictionaries use the name and value editor; an empty one is a single "Add" row.
- A hex colour with opacity exists for integrations that store a colour as text.
- A switch for a flag that can only be true removes the key when off.
- Field labels show once, with the description as small help text under the field.
- Triggers, conditions and device automations draw through two small elements and fall back to the
  old rows for anything they do not claim.
- About 2,150 labels were merged by script, each in English and Cantonese.

## Failure modes and honest gaps

- Device kinds whose types come from the device itself (sensors, buttons on radio remotes) only
  get their extra fields described.
- Fields that hold a template keep the text editor.
- 39 fields sit on an allow-list with a reason each.
- Cantonese is unreviewed by a native reader.

## Faults fixed on the way

"Add action" put the new step at the top, because the button passed its click event as the
position; it now adds at the end, for triggers and conditions too. A step's menu opening under the
floating bars on a phone and hiding Delete led to the phone menu change (see
[`../interface/phone-compact-pass.md`](../interface/phone-compact-pass.md)).

## How it was verified

- One test walks all 1,576 integration folders: 1,133 actions with 2,529 fields, 202 triggers, 161
  conditions and 77 device automation files. No action lacks an editor. Removing one integration
  from the registry made it fail and name the three actions. Each editor file also has its own
  test with a hand-written list.
- Seen in a local build at 390, 360 and 1440 px: nine pages with no sideways overflow and no
  console errors, a real sign-in, and ten integration actions with their editors in English and
  Cantonese.
- Not seen in a browser: device automation fields, the hex colour on a real printer action, the
  name and value editor writing values, and the last small edit to the Add button and menu.
- 207 actions and 512 triggers and conditions were exercised for the entity-kind pass; see
  [`../interface/entity-sheets.md`](../interface/entity-sheets.md).
