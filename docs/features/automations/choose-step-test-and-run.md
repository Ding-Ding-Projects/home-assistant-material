# Testing and running a Choose step

Code: `frontend/src/panels/config/automation/option/`, `condition/ha-automation-condition-row.ts`,
`run-helpers.ts`, `automation-check.ts`.

## What it does

- Each condition row has a test button, and each Choose option has a test button that checks
  all of the option's conditions now and reports whether the option would run. A test runs and
  saves nothing. (Seen working in a running build earlier: `../../screenshots/automation-option-test.png`.)
- The Choose step can test and run one option, the default actions, or the whole step.
- A disabled condition is left out of a test. Old results are cleared when the step is edited.
  An option that can never run is marked.
- Run now, for automations and scripts, says that the saved version runs, asks first, and
  reports the result. It is off while there are unsaved changes. If the automation is turned
  off, the confirmation says so.

## Failure modes

Run asks first because running an action changes the house.

## Verification

The condition and option test buttons were seen. The Choose step tests and runs, the marking of
impossible options, and Run now have not been seen in a running build. Not built: named test
cases and the dry run of a whole automation.
