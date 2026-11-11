# Save bar in the script and scene editors

The script editor and the scene editor use one shared bar, `ha-editor-save-bar`
(`frontend/src/components/editor/`), instead of a floating save button.

## What it does

- Sits at the bottom of the editor's scroll area and sticks to the bottom edge.
- Shows an unsaved-changes label, a Discard changes button and a primary Save
  button. Buttons are at least 44 px tall and reachable with the keyboard.
- Is hidden while nothing changed (`hide-when-clean`). It appears when there
  are unsaved changes, while a save runs, or when problems must be fixed.
- Save is disabled while saving and for a read-only item. A read-only item
  never shows the bar with changes to save.
- Leaves room for the safe area and the phone bottom bar, using the published
  visible height of that bar, and rests on the keyboard when it is open.
- A polite live region announces "Saved" when a save finishes with nothing left
  unsaved; an alert region announces a failed save with its message.

## Where it applies

| Editor mode | Bar |
| --- | --- |
| Script, YAML | `ha-editor-save-bar` in `ha-script-editor.ts`, hidden when clean, with Discard |
| Script, visual | The bar of the shared manual editor (also used by the automation editor), always shown |
| Scene, review, live and YAML | `ha-editor-save-bar` in `ha-scene-editor.ts`, hidden when clean, with Discard and Try it |

Discard changes goes back through each editor's existing unsaved-changes
confirmation, so the protection against losing work is unchanged.

## Rules

The rules for visibility, enabled state, the label and the announcement are
pure functions in `save-bar-logic.ts`, tested in
`frontend/test/components/editor/save-bar-logic.test.ts`.

## State

Built; not yet seen in a running build. The visual mode of the script editor
still uses the shared manual editor's bar, which is owned with the automation
editor and does not yet hide when clean.
