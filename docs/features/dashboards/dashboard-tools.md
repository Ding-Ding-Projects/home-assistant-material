# Dashboard tools

Edit mode on a dashboard has a Dashboard tools dialog that works on the whole dashboard at once.

## What it does

- **Outline.** Every view, section and card, nested cards included, with a pattern-aware search
  (plain text or `/pattern/flags`), multi-select, and bulk duplicate, delete (with confirmation),
  move to any view or section, and copy as YAML.
- **Find and replace.** Replaces an entity ID across views, sections, badges and cards, with a live
  count of the places that will change.
- **Check.** Reports missing and unavailable entities, empty views and sections, duplicate view
  paths and cards without a type.
- **Card templates.** Saved to the person's account and inserted anywhere.
- **Statistics and preview width.** Counts of views, sections and cards, and a phone, tablet or
  desktop preview width.

Every change goes through the dashboard's saved configuration, so the toolbar undo and redo cover
it.

## Where the code lives

- `frontend/src/panels/lovelace/editor/dashboard-tools.ts`: the pure editing functions.
- `frontend/src/panels/lovelace/editor/dashboard-tools-dialog/`: the dialog.
- `frontend/src/panels/lovelace/hui-root.ts`: the entry in edit mode.
- `frontend/test/panels/lovelace/editor/dashboard-tools.test.ts`: tests of the editing functions.

## Verification

Only the unit tests of the editing functions have run. The dialog has not been opened in a browser,
so its layout, search, bulk actions and undo have not been seen working.

## Failure modes and security

- A delete asks first and can be undone from the toolbar.
- Templates are stored for the signed-in account only.
