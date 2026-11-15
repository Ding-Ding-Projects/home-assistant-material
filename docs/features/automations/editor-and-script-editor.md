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

## Narrow-screen mode and condition results

The script editor keeps its run-mode controls at the top of its content scrollport.
The search panel sticks below those controls using their measured height, including
wrapped labels and the maximum-runs field. Search navigation reserves both panels'
height when bringing a matching step into view. The toolbar remains owned by the
page layout; no extra fixed toolbar padding is added.

Condition summaries and persistent live-test results share a vertical header in both
sidebar and inline expansion layouts. Result text wraps within the available width,
so an unknown result remains readable without covering the condition description.
Transient event chips, drag handles, test buttons and menus retain their existing slots.

These changes have been source-reviewed only. Builds, type checks, automated tests
and rendered narrow-screen verification have not been run for this change. The
reported photo shows a partially scrolled mode row; it does not establish an incorrect
page-toolbar offset. Sticky mode controls are an explicit reachability improvement.
