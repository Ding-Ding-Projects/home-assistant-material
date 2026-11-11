# Starting points for an empty automation and an empty script

Status: built, not seen in a running build.

When an automation has no triggers, no conditions and no actions, or a script has no actions, the
editor shows six cards (`ha-starting-points`) above the sections. Choosing a card fills in a
complete example through the editor's own normal change path, so the draft, undo and save behave as
for any other edit.

## The examples

Automations: at sunset send a notification, every day at a chosen time (7:00, changed in the
editor), when something changes state (the person picks the entity), wait then notify, choose
between two options, and repeat until a condition is met.

Scripts: send a notification, wait for sunset then notify, wait for a state change (the person picks
the entity), wait then notify, choose between two options, and repeat until a condition is met.

None names an entity that might be missing. Notifications use `persistent_notification.create`,
which every system has, and the state examples leave the entity for the person to pick.

## Rules

- The cards disappear as soon as anything is added, and also while the editor is read-only or saving.
- Choosing a card never overwrites content: it does nothing once anything exists, and an alias the
  person already typed is kept.
- All text is localized in English and Cantonese under `ui.components.starting_points`.

## Where it lives

- `frontend/src/components/starting-points/automation-starting-points.ts` holds the examples.
- `manual-automation-editor.ts` and `manual-script-editor.ts` show the cards.

## How it was checked

`frontend/test/components/starting-points/automation-starting-points.test.ts` validates every example
against the existing structs, checks ids are unique, no entity is named, and every localization key
exists in both languages. The editors were not opened in a browser.
