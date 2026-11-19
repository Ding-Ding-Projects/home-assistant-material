# Backup before updating

One choice, "Make a backup first for", decides which updates get a backup of their own before
they run. Commit `4cb1fe589`, with the wording in `a5bbfa5da`. The design is board 38 of
`design/canvases/38-progress-drafts-entities`.

## The choice

| Option | Meaning |
| --- | --- |
| System updates only | Core, Supervisor and the operating system get a backup first; everything else does not. |
| Every update | Every update gets a backup first. This is the default and is what the old single switch meant. |
| No update | No update gets a backup first. |
| Custom | A selectable choice. Opens a searchable list with a tick per app, and a choice for apps installed later. It was a disabled button, and later stayed unselected or did nothing without a Supervisor; see below. |

A list under the choice states what the option means kind by kind, and each kind can be set by
hand. Update rows carry a small mark saying whether a backup comes first. A chosen app gets a
backup of itself alone right before its own update. Core, Supervisor and the operating system
share one backup, made by the first of them in a run.

## Finding the per-app choice

"Custom" used to be a disabled button, so the per-app choice hid behind it. In `19767b529` Custom
opens the list, and a plain row says "Apps: choose which apps get a backup first". That row was
seen in a real run of build 523. Later faults: Custom did nothing when there was no Supervisor
(fixed in `02dd3f9b4`). In build 523 it does not stay selected after it is chosen; that is fixed
on main in `c9e3a5e67`, tested, and not yet seen in a real run.

## One decision, three users

The row's Update button, "Update everything" and automatic updates on the server all use the same
decision, so the page and the automatic path cannot disagree. The update's own detail dialog
follows the choice; flipping its switch there applies to that one update.

## Safety

Turning backups off for a system update asks for the two-key confirmation, in the page and in the
detail dialog.

## Migration and changed behaviour

The old single switch migrates: on becomes "every update", off becomes "no update". The row's
Update button made no backup before; it now follows the choice.

## Failure modes and gaps

- Apps show no size, because nothing reports one; "about N MB in the last backup" appears only
  when a past backup recorded a size.
- If the backup for an update fails, the behaviour is the server's existing one; this was not
  re-examined for this change.

## How it was verified

Server part: 128 tests pass. Frontend: 398 tests in the affected folders (plus `backup-choice.test.ts`
for the Custom fix). The per-app row was seen in a real run of build 523. "Custom" staying
selected was seen in a real run of build 2026.11.1.524. Not yet seen: a real update that makes a
backup of a chosen app.
