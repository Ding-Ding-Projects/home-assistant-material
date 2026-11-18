# Autosaved drafts, import and export for editors

Commits `9ad0a9d54` and `117f536c0`, with `28e6e9e7d` for the sending rules. Server part:
`core/homeassistant/components/editor_drafts/`; frontend: `frontend/src/data/editor-drafts.ts`.
Design: board 38 (drafts).

## Autosaved drafts

While an automation, script or scene is being edited, each change is saved two seconds later as a
draft on the instance. Drafts live in a small Git repository of their own under the cache folder,
one commit per autosave. It is outside every file Home Assistant loads and outside backups.

- A draft never runs and never reloads anything. The live item only changes when Save is pressed,
  as before; the draft is then removed.
- After a crash, a closed tab or a restart, opening the item offers the draft back: Continue
  editing, See what changed, or Discard. It warns if the live item changed in the meantime. A
  draft history lists the autosaves and restores one into the editor.
- Nothing is sent when the content is the same apart from key order or empty values. A server that
  says "too soon" is asked at most six times. A status change redraws only the draft line. Drafts
  are flushed when the page is hidden.

### Limits

1 MB per draft, 200 drafts, history squashed past 200 commits per draft or 20 MB, and drafts
untouched for 30 days removed. A damaged repository is recreated empty. If Git is missing, the
editor says "Draft not saved" and carries on. A server without the draft store is handled quietly.

## Export

An item can be exported as a YAML file or to the clipboard from the editor menus. Automations can
be exported several at once from the list. A notice comes first when the file appears to hold
something private. Script and scene list pages have the same export and import as automations
(`117f536c0`).

## Import

Import a file or pasted text: one item or a list, checked with the editor's own validation, with a
preview that marks entities, devices and areas this home does not have. It opens as a new unsaved
item; nothing is replaced until Save, and items imported together are turned off after their first
save. Scene imports are checked for shape only and say plainly that the server does not check
them. An imported automation that cannot be turned off says so with a one-tap fix.

## Security

Drafts are kept outside the files Home Assistant loads, so a draft cannot start anything. Export
warns before writing out content that looks private.

## How it was verified

- A test proves the three live files are byte-identical after saving drafts.
- Not simulated: a crash, and recovery after a real crash. Not seen in a browser: the draft
  recovery card, the history list, export and import, the import preview.
- The editor crash seen in a real run of build 519 was not reproduced in five-minute idle runs, so
  its cause is not found. The draft changes above remove three weak spots but are not a proven fix.
