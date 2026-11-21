# Quick actions

A quick action is a short list of steps, written in the guided view or as
YAML, that runs once and is then thrown away. It is opened with "Run a quick
action" next to an entity. It is never saved: nothing is written to the
configuration, to `.storage` or anywhere else unless you press "Keep as a
script", which opens the script editor so you can see and name the script
before saving it.

## Where it runs

- **Administrators** run it on the server through the built-in `quick_action`
  component. The steps keep running if you close the page or the browser, so a
  step that waits ten minutes still happens.
- **Everyone else** runs it from the page: each step is sent as an ordinary
  action call that the server checks against your permissions, and waits
  happen in the page. If you leave or reload the page during a wait, the steps
  after it do not run.
- With an older server that does not have the `quick_action` component, an
  administrator's quick action runs once on the server as before and cannot be
  listed or stopped; the dialog says so.

## Stopping a quick action

- While a quick action runs, the dialog shows **Stop** next to **Run**.
  Stopping never asks for confirmation, because stopping is the safe direction.
- When any quick action is running on the server, a line at the top of the
  dialog says how many are running and lists each one with when it started,
  what it is doing now (when the server reports it) and its own **Stop**
  button. The same list appears at the top of the Actions tool
  (Settings, Tools, Actions), so a quick action started from another browser
  or a closed page can be stopped there.
- Stopping takes effect at once during a wait. An action call that is already
  in progress finishes; the steps after it do not run.
- Only administrators can start, list or stop server quick actions.

## What the server keeps

The server keeps quick actions in memory only:

- running ones, and ended ones (finished, failed or stopped) for ten minutes;
- for each: a label, the entity it was started from, the id of the user who
  started it, when it started and ended, its state, the number of top-level
  steps, a short description of the action it is on, and the error text when
  it failed;
- at most 20 at a time. When 20 are still running, a new one is refused until
  one is stopped; ended ones make room by themselves.

## Restarts

A quick action does not survive a restart. Every quick action still running
when Home Assistant stops is stopped, and the list is empty after Home
Assistant starts again.

## Websocket commands

All are administrator only.

| Command | Does |
| --- | --- |
| `quick_action/run` | Validates `sequence` like `execute_script`, starts it and returns `{"id": ...}` without waiting. Optional `entity_id` and `label` (up to 100 characters). |
| `quick_action/list` | Returns `{"runs": [...]}`, newest first. |
| `quick_action/stop` | Stops the run with `run_id`. Stopping one that already ended succeeds; an unknown id returns `not_found`. |
| `quick_action/subscribe` | Sends the list now and whenever it changes. |

## Verification

- Server tests: `core/tests/components/quick_action/test_init.py` (run
  returns at once, list, stop during a wait, failure text, administrator
  only, the limit of 20, stopping at shutdown, forgetting ended runs).
- Interface tests: `frontend/test/data/quick-action.test.ts` (server run
  states, the running list, label length, a wait that can be stopped).
- Not yet seen in a running build.
