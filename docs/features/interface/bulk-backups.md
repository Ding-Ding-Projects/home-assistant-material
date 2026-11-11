# Bulk delete on the Backups table

The backups list (Settings, System, Backups, My backups) uses the shared
selection bar for deleting several backups at once. The old selection menu of
the table is gone; the bar is the same one the helpers list uses.

## Behaviour

- Ticking rows shows the bar at the bottom: how many backups are selected,
  select all on the page, invert, and a note when a search or filter hides
  some of the selected ones. Hidden selected backups stay selected and are
  included in the delete.
- **Delete selected** opens a preview before anything happens. It lists each
  backup with its name, date and size, and adds:
  - a line saying so for the **most recent backup** of all backups, not only of
    the selection;
  - a line for every backup that is the **only copy**, meaning it is stored in
    one location only, naming that location.
- Deleting asks twice. The first press of **Delete** turns the button into
  "Yes, Delete" with a warning; only the second press deletes. Changing the
  selection closes the preview.
- Backups that are locked, still being created or no longer present are listed
  as skipped with the reason and are not deleted. When nothing is left to
  delete the confirm button stays disabled.
- If some deletions fail, the others still go through. A message says how many
  were deleted and lists each backup that failed with the server's message. The
  failed backups stay selected so they can be tried again.
- The row overflow menu keeps **Download** and **Delete** for a single backup.
  The old selection bar offered delete only, so no bulk download was removed.

## Never shown

The preview and the delete use the id, name, date, size and locations of a
backup. No encryption key is read, shown or sent.

## Limits of the data

- The instance does not report a lock on a backup, and a backup that is still
  being created is not in the list yet. The skip rules support both, but the
  page has nothing to pass, so today nothing is skipped for these two reasons.
- "Only copy" is decided from the locations the backup list reports.

## Code

- Rules: `frontend/src/panels/config/backup/backup-bulk-actions.ts`
  (`planBackupDelete`, `summarizeBackupDelete`).
- Page: `frontend/src/panels/config/backup/ha-config-backup-backups.ts`.
- Tests: `frontend/test/panels/config/backup/backup-bulk-actions.test.ts`.

## Verification state

The rules are covered by unit tests. The page has not been seen in a running
build.
