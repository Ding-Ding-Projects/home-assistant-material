# Automation tools

A Tools entry in the automation editor's menu opens a dialog on a wide window and a bottom sheet
on a phone. The tools are listed in `frontend/src/panels/config/automation/tools/registry.ts`.
Built in batches 44 and 48.

| Tool | What it does |
| --- | --- |
| Flow | The automation as a flow with a minimap; a node jumps to its step |
| Trace | Lists stored runs |
| Simulator | Dry run on the existing check: time, weekday, zone, state, numeric, and explicit trigger-ID conditions; anything else is reported as "cannot tell"; never calls a service |
| Replay | Replays a recorded day from real history |
| Conflicts | Static detection of possible conflicts and loops, worded as possibilities |
| Plain language | The configuration as sentences; two sentence patterns turn into a draft (more patterns in batch 48) |
| Steps and locks | Turn steps on and off; lock a step with `editor_locked` |
| Variables | Variable and template inspector with live previews |
| Blueprint maker | Builds blueprint YAML to copy, plus a snippet library kept per browser |
| Health | A score with its formula shown on screen |
| Week ahead | When time and time-pattern triggers fire |
| Entity swap | Replace an entity across automations with a review and one save per automation |
| Breakpoints | Pause a live run with Step, Continue and Stop, through the server's existing trace debugging commands |
| Test cases and coverage | Saved cases per automation (see `named-test-cases.md`) with a coverage map |

Also in the editor: each trigger and condition row shows its entity's current state, and a
condition says whether it passes now, using the existing condition test call, throttled.

## Fast mode, groups, relationships and levels (batch 52)

- **Fast mode:** a collapsed branch no longer builds its children, and long lists draw 40 rows at
  a time. A synthetic 530-row configuration builds 5 rows with its branches closed (unit test).
- **Trigger groups:** triggers can carry `editor_group`. The server accepts and drops it, like
  `editor_locked`; this was run for real on a throwaway instance.
- **Relationships:** a tool that shows what an automation connects to, and "From ..." chips on
  rows that came from somewhere.
- **Levels:** Simple, Advanced and YAML.

## Add a step here and keys (batch 54)

An "Add a step here" control sits between any two steps and inserts at that position, in the
root list and in nested lists. Placed inside a trigger group it joins that group. It respects
fast mode and folded groups. In the visual editor the keys T, C and A add a trigger, a condition
and an action. They do nothing in fields or dialogs, and only work when keyboard shortcuts are
on. Ctrl Shift F was not rebound. Unit tested, not seen in a browser. The string builder
(`../interface/string-builder.md`) is reached from action text fields.

## Locks on steps

A locked step carries `editor_locked: true`. The server accepts and drops this field on
automation steps (`helpers/config_validation.py`), so the automation runs normally. The lock
only stops edits in this editor. It is a guard against slips, not a security measure.

## Limits and failure modes

- Simulations never decide what they cannot read; they say "cannot tell" with the reason.
- Conflict and loop findings are static and can be wrong in either direction.
- Test cases are kept in this browser, as described in `named-test-cases.md`.
- The health score is a rule of thumb, not a measurement of correctness.
- Breakpoints use the server's own trace commands; replay uses real history only.

## How it was verified

Unit tested. The step validation was run for real on a throwaway instance (steps carrying
`editor_locked` validate). Nothing in the tool dialogs has been seen in a browser except that the
editor shows one floating action bar and one Save in published build 348. State: built, unit
tested, not yet seen in a running build.

## Trace-to-editor navigation

Selecting a recorded trace step now offers **Show this step in the editor**.
Navigation is available only when the step at that path still matches the recorded
configuration, so a historical run cannot silently point to a different edited or
reordered step. Changed or removed steps retain their recorded details in the
trace tool. Hidden rows produce guidance to expand their parents or use the visual
editor; they are not automatically unfolded.

Rapid run selection discards older responses, clears obsolete details while loading,
and leaves the run picker available after a failed request. No automation is executed
by this navigation. The matching logic has focused unit coverage; browser verification
is still required.

### Simulated trigger conditions

The Simulator and editor test-case situation form accept an optional simulated trigger ID. This lets a test follow `trigger` conditions inside branches without firing a real trigger. The ID is retained when editor test cases are saved or exported. An unset ID leaves trigger conditions undecided; it does not assume the first configured trigger. Templates that read trigger variables remain undecided. Simulation never calls a service or writes entity state.

Verified with focused simulation, saved-case, and dry-run unit tests. Running-UI verification remains pending.
