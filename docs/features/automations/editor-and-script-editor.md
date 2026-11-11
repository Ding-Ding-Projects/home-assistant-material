# Automation editor and script editor

Code: `frontend/src/panels/config/automation/` (`ha-automation-status-bar.ts`, `motion-styles.ts`,
`motion-helpers.ts`, `ha-automation-editor.ts`), `frontend/src/panels/config/script/ha-script-editor.ts`.

## What it does

- The automation editor shows the name as a large title and triggers, conditions and actions as
  three named cards. In a Choose step, options are numbered chips.
- It has an on and off switch beside the title, a Check button, and a strip showing the
  automation's history.
- Motion: cards open and close smoothly, new steps slide in, results fade in. Every motion
  respects the reduce-motion setting, and the shared expansion panel completes directly when the
  motion duration is zero.
- The script editor is redrawn with a mode selector, Run now and See past runs.

## Limits

Not built: the sticky bottom bar next to Save in both editors (it needs the shared editor
layout in `ha-manual-editor-mixin.ts`), a dry run of the whole automation, and the repository
strip. `fields_empty` in the script editor is unused.

## Verification

Lint, the type check and unit tests only. Not seen in a running build. Reviewer findings are in
`../../HANDOFF.md`.
