# Restore a backup while the first start is preparing

On a first start the page shows "Preparing Home Assistant" for many minutes while Core downloads. A backup used to be restorable only after that finished, from the welcome step. The preparing page now has a card, **Restore a backup while you wait**: upload a backup, check it, and press **Continue**. The restore is queued on the server and carries on by itself, so the page can be closed.

State: source built, Supervisor and landing page server tests pass; not yet seen in a browser against a running first start. The Core side of the onboarding note is not built (see the end).

## What the person does

1. Choose a `.tar` file (or drop it on a wide window). The upload starts at once and shows size, speed and time left, with **Cancel**.
2. The details appear: name, date, size, what it holds, and whether it is protected. A protected backup asks for its encryption key, with **Check key**; **Continue** stays off until the key opens the backup.
3. **Continue** queues the restore. The card lists four steps (preparing, restoring, starting, ready to sign in), each with its state written as text. The page can be closed.
4. **Cancel restore** asks first and works only until the restore starts.
5. If the restore fails, the page says what went wrong and offers **Try again** (a protected backup asks for its key again) or **Set up without the backup**, which removes the uploaded backup only after a confirmation.

When Core answers again the page reloads to the usual sign-in screen.

## How it works

- **Landing page** (`frontend/landing-page`): the card is `landing-page-restore`; the preparing page, logs and network check stay on the left. The columns stack at phone width. Strings are under `landing-page.restore` in `en.json`, with Cantonese in `yue-own.json`.
- **Landing page server** (`landingpage/`): forwards only `POST /backups/new/upload`, `GET /backups/{slug}/info`, `POST /backups/{slug}/check_password`, `POST /backups/{slug}/restore/full/when_ready` and `GET`/`DELETE /backups/restore/pending`. Anything else under `/backups` is refused, path traversal checks stay, and the upload is streamed with no size limit.
- **Supervisor** (`supervisor/backups/pending_restore.py`):
  - `POST /backups/{slug}/check_password` checks a key without restoring.
  - `POST /backups/{slug}/restore/full/when_ready` (optional `password`) validates the backup and key, then stores one pending record in the Supervisor data folder. The password goes in its own file with mode 600 and is deleted as soon as the restore has used it.
  - When Core's install finishes and the Supervisor is running, the Supervisor starts the full restore by itself. A Supervisor restart while queued carries on; one during the restore queues it again. The restore is the ordinary full restore job, so its progress is in the jobs API.
  - `GET /backups/restore/pending` returns the record (`queued`, `running`, `done`, `failed`, with the failure message kept). `DELETE` cancels a queued restore or dismisses a finished or failed one; it is refused while the restore is running. `remove_backup: true` also deletes the uploaded backup.
- **Onboarding** (`frontend/src/onboarding`): when a pending or finished restore exists, the welcome step is replaced by its progress, then by the sign-in note or the failure.

## Limits

- One restore can be queued at a time.
- Only a full backup can be queued.
- The restore cannot be cancelled once it has started.
- The onboarding screen reads `GET /api/onboarding/restore/pending`, a Core route that does not exist yet. Until it does, onboarding shows its ordinary welcome step.
