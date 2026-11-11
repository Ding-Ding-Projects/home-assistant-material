# Named test cases and simulated runs

The automation history manager lists every saved version of every automation.
Test cases add a way to describe a situation once, give it a name, and check
what a version would do in it, without touching the house.

## What a test case is

A test case belongs to one automation and holds:

- a **name** (at most 80 characters, unique within the automation);
- a **trigger**: the trigger id that fires (used by `trigger` conditions), a
  short description of what fires it, and trigger variables as `name = value`;
- optional **fake states**, one `entity id = state` per line;
- the **expected result of the conditions**: pass or do not pass.

Limits: at most 20 test cases per automation, 20 trigger variables, 50 fake
states, 255 characters per state or variable value, 200 characters for the
description. Entity ids must look like `domain.object_id`; variable names use
letters, digits and underscores.

## Using it

Choose one automation in the scope selector of the history page. The Test cases
card appears below the version list. From it you can:

- create, edit, rename, duplicate and delete cases;
- pick which version to simulate (the live version by default);
- simulate one case, or all of them.

Every result is labelled **Simulated**. After a run each case shows:

- a verdict against the expectation: as expected, not as expected, or could not
  be decided;
- the conditions in reading order with their individual results, and the reason
  when one failed or could not be decided;
- when the conditions pass, the actions that would run, in order. Only the
  top-level steps are listed; a `choose`, `if` or `repeat` is named but not
  entered.

## What the simulation does and does not do

The simulation reads only the saved version and the fake states. It calls no
service, reads no real entity state and writes nothing.

Evaluated: `state` (single or several entities, a list of states, `match`),
`numeric_state` (plain numeric `above` and `below`, both strict), `trigger`,
and `and`, `or` and `not` in every written form, nested. A condition that is
turned off is skipped. An entity with no fake state does not exist in the run, so
a state or numeric condition on it does not pass.

Not evaluated, and reported as undecided instead of guessed: conditions on
attributes, a `for` duration, templates, time, sun, zone, device and platform
conditions, and limits that name another entity. A decided result still wins
where logic allows it, for example one failed condition inside `and`.

Fake states are plain text. Because of that a numeric condition needs the state
written as a number.

## Where cases are stored

Test cases are kept in this browser's `localStorage`, one list per automation id
under the key `ha-automation-test-cases:<automation id>`. They are never sent to
the server. If the browser refuses to store them, the page says so and keeps the
cases only until it is closed. A stored case that no longer fits the limits is
left out when loading.

## Code

- `frontend/src/panels/config/automation-history/test-cases.ts`: the model,
  validation, list operations and storage.
- `frontend/src/panels/config/automation-history/simulated-run.ts`: the
  simulation and the comparison with the expected result.
- `frontend/src/panels/config/automation-history/ha-config-automation-history.ts`:
  the Test cases card.
- `frontend/test/panels/config/automation-history/test-cases.test.ts`: tests for
  validation, storage failure and the condition logic.
