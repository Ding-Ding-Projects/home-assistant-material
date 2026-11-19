# Delete proof backups

A backup can be marked **delete proof**. While the mark is on, nothing Home
Assistant does can delete that backup or any copy of it in a location Home
Assistant manages. The mark stays until an administrator turns it off.

Design reference: `design/canvases/38-progress-drafts-entities/Locked.dc.html`.

## The rules

1. A delete proof backup is never deleted by Home Assistant: not by the Delete
   button, not by deleting several, not by automatic cleaning up by count or by
   age, not by freeing space, and not by the cleanup after an app or Core
   update.
2. The rule is held by the backend, not only by the page. A request to delete
   one is refused with a reason code (see below).
3. The mark covers every copy in every location the backup manager lists. A
   copy removed outside Home Assistant is outside this rule (see the limits).
4. Delete proof backups do not count toward "keep the newest N" and are never
   removed by age. They are kept besides the configured number.
5. Only an administrator can see or change the mark. Turning it on needs no
   confirmation. Turning it off needs the two keys and the slider.
6. The mark survives a restart, an update and a restore. It records when it
   was set and by whom.
7. The Backups page says how many delete proof backups there are and how much
   space they use. Nothing is ever cleared to make room.

## Every delete path and what covers it

| Path | Covered | How |
| --- | --- | --- |
| `backup/delete` websocket command (the Delete button, deleting one from the list) | Yes | `BackupManager.async_delete_backup` raises `BackupDeleteProof`; the command answers with error code `backup_delete_proof` |
| Deleting several from the Backups list | Yes | The page skips marked backups and says "2 deleted. 1 kept because it is delete proof."; each request still goes through `backup/delete`, so a backup marked meanwhile is refused and counted as kept |
| Automatic retention by count (global or per location) | Yes | `async_delete_filtered_backups` leaves marked backups out before the include and delete filters run, so they are neither deleted nor counted |
| Automatic retention by age (global or per location) | Yes | The same filter step |
| Cleanup of old backups after an app update (`hassio.backup_addon_before_update`) | Yes | The same filter step |
| A backup marked while a cleanup is running | Yes | The cleanup calls `async_delete_backup`, which refuses it; the cleanup keeps it and continues |
| Supervisor `DELETE /backups/{slug}` (used by Home Assistant for Supervisor locations, by apps with backup access and by the `ha backups remove` command) | Yes | `BackupManager.remove` raises `BackupDeleteProofError` (HTTP 403, error key `backup_delete_proof_error`) |
| Supervisor cleanup of old Home Assistant transfer backups (`tasks_core_backup_cleanup`) | Yes | Marked backups are left out |
| Supervisor "clear full backups" fix for low free space | Yes | Marked backups are left out and do not count toward the minimum kept |
| Supervisor removal of an invalid uploaded file, or of a file left by a failed backup | Not applicable | These files are new and cannot have been marked |
| A file deleted in a cloud drive's own app, on a network share, or from a shell on the host | No | Outside Home Assistant. The page lists a mark whose backup no location reports as missing |
| Someone with shell or file access editing the stored marks | No | The marks are protection against Home Assistant's own actions, not against a person with access to the files |

## Where the mark is stored

- **Home Assistant Core** keeps the marks in `backups/delete_proof.json` in the
  configuration folder, keyed by backup ID, with the time (UTC) and the user ID
  and name that set them. The `backups` folder is kept when Home Assistant
  restores a backup, so a restore neither brings back old marks nor loses new
  ones. It is not part of the backup archive's own metadata, because a backup
  archive is not changed after it is written.
- **Supervised installations**: the Supervisor also stores the marks, in its
  own `backups.json` under `delete_proof`, keyed by the same ID (the
  Supervisor's slug). That file is part of the Supervisor's data, which a
  restore does not replace. On start, Home Assistant reads the marks from the
  Supervisor and uses them; the local file is then a copy used only when the
  Supervisor cannot be reached. Turning the mark on or off is stored with the
  Supervisor first; if the Supervisor refuses or cannot be reached, nothing
  changes and the page says so.
- Only Home Assistant may change the mark through the Supervisor
  (`POST /backups/delete_proof`). An app with backup access gets HTTP 403.

If the local file exists but cannot be read, Home Assistant treats every
backup as delete proof: nothing is deleted by hand or by retention, and the
marks cannot be changed, until the file is readable again. The page says this.
If the Supervisor's `backups.json` cannot be parsed, the Supervisor resets it
to defaults, which drops its marks; Home Assistant then still holds its own copy.

## Turning it off

The websocket command is `backup/delete_proof/set` with `backup_id`,
`delete_proof` and `confirmed`. Turning it off without `confirmed: true` is
refused with error code `confirmation_required`, and the Supervisor refuses it
too (`backup_delete_proof_confirmation_error`).

`confirmed` is a flag the page sends after the two keys and the slider. It is
the same server side check the other two-key confirmations use: it stops a
plain or accidental request, but it is not a secret. An administrator's own
script that sends `confirmed: true` can turn the mark off.

## Interface

- **Backups list**: a lock and "Delete proof" next to the name of a marked
  backup; filter chips "All" and "Delete proof" with the count; a line with how
  many delete proof backups there are and how much space they use; a warning
  for marks whose backup no location reports.
- **One backup**: a Delete proof switch with "Marked 18 Nov 21:58 · by you"
  (24-hour clock) and "Copies covered: This system · N places". While marked,
  Delete is disabled in the menu and the card says "Delete is off. Turn off
  delete proof first." in a status region that screen readers announce.
- **Search of everything**: "Delete proof backups" opens the list filtered to
  delete proof backups (administrators only).
- **Marking from elsewhere**: `markBackupDeleteProof(hass, backupId)` in
  `frontend/src/data/backup_delete_proof.ts` marks one backup in a single call,
  for a one tap action such as the card shown when the backup made before going
  back to an earlier build has finished.

Both English and Cantonese strings are in `ui.panel.config.backup.delete_proof`.

## Verification

- Core: `core/tests/components/backup/test_delete_proof.py` (11 tests) and
  `core/tests/components/hassio/test_backup_delete_proof.py` (5 tests).
- Supervisor: `supervisor/tests/backups/test_delete_proof.py` (8 tests).
- Frontend: `frontend/test/data/backup_delete_proof.test.ts`.
- Not yet seen in a browser or on a running instance.
