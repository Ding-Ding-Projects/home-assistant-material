# Restore a backup while the first start is preparing

On a first start the page shows "Preparing Home Assistant" for many minutes while Core downloads. A backup used to be restorable only after that finished, from the welcome step. The preparing page now has a card, **Restore a backup while you wait**: upload a backup, check it, and press **Continue**. The restore is queued on the server and carries on by itself, so the page can be closed.

State: source built, Supervisor, landing page server, Core onboarding views and frontend unit tests pass; not yet seen in a browser against a running first start. The Core onboarding routes are built (see "How it works"), so the progress and failure views are reachable after the install too.

## What the person does

1. Choose a `.tar` file (or drop it on a wide window). The upload starts at once and shows size, speed and time left, with **Cancel**.
2. The details appear: name, date, size, what it holds, and whether it is protected. A protected backup asks for its encryption key, with **Check key**; **Continue** stays off until the key opens the backup.
3. **Continue** queues the restore. The card lists four steps (preparing, restoring, starting, ready to sign in), each with its state written as text. The page can be closed.
4. **Cancel restore** asks first and works only until the restore starts.
5. If the restore fails, the page says what went wrong and offers **Try again** (a protected backup asks for its key again) or **Set up without the backup**, which removes the uploaded backup only after a confirmation.

When Core answers again the page reloads to the usual sign-in screen.

## What happens when Core is installed

Pulling the Core image stops the landing page container, so the landing page is gone as soon as the install ends. With a restore queued, the Supervisor does not start an empty Core first: it starts the restore, which starts Core with the restored configuration, so onboarding is never offered for the empty system. This is why the progress, failed, **Try again** and **Set up without the backup** views of the landing page card can only be seen before the install ends. After that the person reaches the Core address, which answers once the restore has finished. A failed restore has no screen on the landing page then; its failure message is kept in the record and is shown by the Core onboarding page through the routes below.

## Safety

- The landing page has no sign in, so its proxy only passes requests that come from the page itself: a request that changes something needs the `X-Requested-With` header, a matching `Origin` when there is one, and a JSON (or, for the upload, multipart) body. No query string is forwarded.
- The Supervisor only queues a restore while Home Assistant is not installed, and only a restore queued then may start by itself. A restore that was running when the Supervisor stopped is marked failed ("interrupted") and is never run again automatically; the person chooses **Try again**, which asks for the key again.
- A backup newer than any available Supervisor, or too large for the free space, is refused when it is queued. A backup whose slug is not a plain name is refused on import.
- An uploaded backup that is never queued can be discarded (`DELETE /backups/restore/pending` with its `slug`) at first start. The card does this when a different file is chosen.

## How it works

- **Landing page** (`frontend/landing-page`): the card is `landing-page-restore`; the preparing page, logs and network check stay on the left. The columns stack at phone width, with the backup card directly under the progress. Strings are under `landing-page.restore` in `en.json`, with Cantonese in `yue-own.json`.
- **Landing page server** (`landingpage/`): forwards only `POST /backups/new/upload`, `GET /backups/{slug}/info`, `POST /backups/{slug}/check_password`, `POST /backups/{slug}/restore/full/when_ready` and `GET`/`DELETE /backups/restore/pending`. Anything else under `/backups` is refused, path traversal checks stay, and the upload is streamed with no size limit.
- **Supervisor** (`supervisor/backups/pending_restore.py`):
  - `POST /backups/{slug}/check_password` checks a key without restoring.
  - `POST /backups/{slug}/restore/full/when_ready` (optional `password`) validates the backup and key, then stores one pending record in the Supervisor data folder. The password goes in its own file with mode 600 and is deleted as soon as the restore has used it.
  - When Core's install finishes and the Supervisor is running, the Supervisor starts the full restore by itself, in place of the first start of Core. A Supervisor restart while queued carries on; one during the restore marks it failed. A Supervisor update in the way keeps it queued. The restore is the ordinary full restore job, so its progress is in the jobs API.
  - `GET /backups/restore/pending` returns the record (`queued`, `running`, `done`, `failed`, with the failure message kept). `DELETE` cancels a queued restore or dismisses a finished or failed one; it is refused while the restore is running. `remove_backup: true` also deletes the uploaded backup.
- **Onboarding** (`frontend/src/onboarding`): when a pending or finished restore exists, the welcome step is replaced by its progress, then by the sign-in note or the failure. A failed restore offers **Try again** (a protected backup asks for its key) and **Set up without the backup**, which asks first and then removes the uploaded backup.
- **Core routes** (`core/homeassistant/components/onboarding/views.py`), all without sign in, not registered once onboarding is done (404), and 404 without a Supervisor:
  - `GET /api/onboarding/restore/pending` returns `pending_restore` with only `name`, `state`, `size_bytes`, `protected`, `error`, `queued_at`, `started_at` and `finished_at` (never the slug, job id or key), or `null`.
  - `DELETE /api/onboarding/restore/pending` (`remove_backup`) discards the record, and the uploaded backup when asked.
  - `POST /api/onboarding/restore/pending/retry` (optional `password`) asks the Supervisor to run a failed restore again.
  - Changes are spaced at least two seconds apart (429 otherwise), so a key cannot be guessed quickly.
- **Supervisor retry** (`POST /backups/restore/pending/retry`): only for a failed record. It checks the key against the backup first, then queues the restore again and starts it at once when Core is idle. The landing page proxy does not forward it.

## Limits

- One restore can be queued at a time.
- Only a full backup can be queued.
- The restore cannot be cancelled once it has started.
- Differences from the design board, on purpose: the preparing intro keeps its existing logo and bar, and the "Step 1 of 3" strip on the phone card is not built.
- The onboarding page shows no backup date, step or progress percentage: the record keeps only the state, the error and the times.
