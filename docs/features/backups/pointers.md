# Backups kept as pointers

Once a backup is safely in a container registry place, the copy on this disk
can be replaced by a small record, a **pointer**, to save space. The backup
stays listed, because the registry place still lists it. Restoring it brings
the copy back first.

Design reference: `design/canvases/38-progress-drafts-entities/Pointer.dc.html`.

Page: **Settings > System > Backups > Saving space** (`/config/backup/pointers`),
also found by the quick bar as "Backups as pointers". Administrators only.

## The rules

1. Off by default. The switch "Keep only a pointer here" can be turned on only
   while a container registry place is set up and unlocked (its config entry is
   loaded, which needs the saved key). Every websocket command is admin only.
2. The copy on this disk is removed only after the registry copy was read back
   in full: the manifest, the sealed header and every part are fetched again
   (nothing cached is used), every part is opened with the vault key, and the
   size and SHA-256 of the plain bytes must equal the size and SHA-256 of the
   copy on this disk. Any other outcome keeps the whole copy and records why:
   `failed` (damaged or tampered), `no_answer` (rate limited or unavailable),
   `timed_out`, `missing`, `unknown`, `registry_copy_differs` (the registry copy
   reads back but is not the same file, for example because it was encrypted
   differently on upload), `local_copy_unreadable`, `local_copy_not_removed`.
3. The newest backups chosen by the owner stay whole: None, Newest 1 (default)
   or Newest 3.
4. A pointer holds no key, no password and no token. Its fields are: backup id,
   name and date, the agent id and name of the registry place, the repository,
   the local agent and file name the copy came from, the size, the check value
   (`sha256:` and the SHA-256 of the backup file), the number and size of the
   parts, when it was made, when the registry copy was last read back in full,
   and the result of the last daily check. A test fails if a field name could
   hold a secret, and if the token, the password or the vault key appear in the
   file.
5. The backup stays listed. Counts are separate: "whole here" counts backups
   with a copy on this system, "pointer" counts pointers. A pointer is not a copy
   on this system, so the self-check, the "on this system" counts and the
   per-location retention for this system do not see it as one.
6. Restore brings the copy back, checks it against the check value (both the
   bytes as they arrive and the file as written), then opens the normal restore
   of that backup. "Bring back here" does only the first half. Both show bytes
   and parts done, and a plain reason when they fail. A copy that fails its
   check is removed again and the pointer stays.
7. A pointer whose registry copy is missing turns its row red and is never
   offered as restorable; bringing it back is refused with
   `registry_copy_missing` after one more check.
8. A delete proof backup can become a pointer and keeps its mark: neither the
   pointer nor the registry copy can be deleted, because every delete goes
   through the delete proof check first. The backup made before going back to an
   earlier build (`extra.reason` is `before_going_back`, made by the Supervisor
   job `home_assistant_core_downgrade_backup`) stays whole until the going back
   has finished. A backup without a verified registry copy is never made a
   pointer by anything: making a pointer is the only path that removes the
   copy, and it always reads back first. Retention never makes pointers.
9. The page says plainly that with only pointers, losing the registry account or
   the password means losing those backups.

## Where things are kept

- Pointers, the setting and the last reason each backup was kept whole:
  `backups/pointers.json` in the configuration folder, next to
  `delete_proof.json`. The configuration folder's `backups` directory is not
  part of a restored backup, so a restore does not bring back old pointers.
- Where the copy on this disk lives: on Core and Container installations,
  `backups/*.tar` in the configuration folder (agent `backup.local`); on
  supervised installations, the Supervisor's local backup storage (agent
  `hassio.local`). Removing it goes through that agent, so on a supervised
  installation the Supervisor removes the `.local` location only and the backup
  stays listed through the registry place.

## When the passes run

- After every backup created by Home Assistant (one minute later, after its
  self-check, and never while a backup, upload or restore runs).
- When the setting is turned on or the number kept whole changes.
- Once a day, after the daily check.
- On request: "Save space now" and "Check pointers now" on the page.

## The daily check

Each pointer is checked once a day: the registry index is read again (and
repaired from the tag list), the backup must still be in it, and the manifest
must still be there with the same digest.

What it does not notice: it does not fetch the parts, so a part the registry
garbage-collected or changed behind a manifest that is still there is noticed
only when the backup is brought back or restored. If the registry place is not
loaded (for example the password is missing), the state is "could not be
reached", not "missing".

## Offline

With no network the daily check records "could not be reached" and nothing
changes. Restore and bring back need the registry to answer; that is why the
newest backup is kept whole by default.

## Websocket commands

| Command | Does |
| --- | --- |
| `backup/pointer/info` | Setting, availability, honest counts, every pointer with `restorable`, the last kept-whole reasons, the current transfer |
| `backup/pointer/settings` | `enabled`, `keep_whole` (0, 1 or 3); turning on without a registry place answers `no_registry_place` |
| `backup/pointer/run` | Runs a pass now and returns each outcome |
| `backup/pointer/check` | Runs the daily check now |
| `backup/pointer/bring_back` | Brings one backup back and checks it |
| `backup/pointer/restore` | Brings back, checks, then restores through `BackupManager.async_restore_backup` |
| `backup/pointer/subscribe` | Sends bring back progress (bytes and parts) as it changes |

## Limits

- The registry copy must be the same file as the copy here. If the backup was
  encrypted or decrypted differently when uploaded to the registry place, it is
  kept whole with `registry_copy_differs`.
- On a supervised installation the Supervisor refuses to remove a copy of a
  delete proof backup, so such a backup stays whole there with
  `local_copy_not_removed`. On Core it can become a pointer.
- Whether a going back has finished is read from the Supervisor's
  `/core/downgrade_status`: finished when there is no record, when it failed, or
  when Home Assistant already runs the version it went to. If it cannot be read,
  the backup stays whole.
- The page opens the normal restore after bringing a backup back; it does not
  choose what to restore by itself.

## Verification

- Core tests: `core/tests/components/registry_storage/test_backup_pointer.py`
  (27 tests against the in-memory registry: verified swap, each failure keeps
  the whole copy, newest kept whole, no secret in the pointer, bring back and
  restore byte for byte, missing copy detected, delete proof, going back,
  retention, counts and self-check, admin only).
- Interface unit tests: `frontend/test/data/backup_pointer.test.ts`.
- Not seen in a browser and not run on a real instance or a real registry.
