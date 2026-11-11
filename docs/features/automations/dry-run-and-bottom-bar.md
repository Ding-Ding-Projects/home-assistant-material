# Dry run and the bottom bar in the automation editor

The automation editor has a bar at the bottom, in every mode (visual, blueprint
and YAML), holding Save, Check, Dry run and Run now. The code is
`ha-automation-bottom-bar.ts`; the dry run itself is `automation-dry-run.ts`,
in `frontend/src/panels/config/automation/`.

## The bar

- **Save** fires the editor's existing save, so what saving does is unchanged.
  It is disabled for a read-only automation, while a save runs and when nothing
  changed (`isSaveDisabled` in `run-helpers.ts`).
- **Check** is the existing check: server validation plus a test of the
  top-level conditions against the current state.
- **Dry run** plays the whole automation, see below.
- **Run now** is the editor's existing Run action: it runs the saved version,
  asks for confirmation and is off while there are unsaved changes.
- The bar sticks to the bottom edge. On a phone it sits above the bottom
  navigation using the published visible height of that bar, rests on the
  keyboard when it is open, and every button is at least 44 px tall. A result
  is cleared as soon as the automation on screen changes.

## The dry run

It uses the configuration on screen, saved or not, and the live states. The
trigger is taken as given. No service is called, no event is fired and nothing
is saved. The only request to the instance is `test_condition`, which reads
state and runs no action.

- State and numeric state conditions are decided in the browser from the live
  states. Other conditions (sun, time, zone, device, template) are tested by
  the server. `and`, `or` and `not` combine their children.
- Actions are listed step by step: the service and the names of its targets,
  the length of a delay, events, waits, and inside choose, if and repeat the
  branch that is taken. A branch that is not taken is listed as skipped without
  going inside it. A `stop` skips everything after it.
- Each step is marked **would run**, **would skip** or **cannot tell**, with a
  reason. Cannot tell is used when a template reads the trigger, an entity does
  not exist, a value is not a number, a template decides a count, or the
  instance could not test a condition. Everything after a step that cannot be
  told is marked cannot tell as well rather than guessed.
- The verdict is read in the text, not only the icon or colour.

## Limits

- Triggers are not evaluated. Template values that depend on the trigger or on
  variables are reported as cannot tell.
- A wait is listed as would run; how long it really waits is not known.
- Not seen in a running build; covered by unit tests of the evaluation and the
  Save rule (`frontend/test/panels/config/automation/automation-dry-run.test.ts`).
- The shared manual editor and the blueprint editor still draw their own save
  bar, and the manual editor its own Check and Run now strip. Until their
  owners remove those, a visual or blueprint automation shows both.
