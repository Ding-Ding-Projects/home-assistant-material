# Activity tray and recovery card

Status: built, not yet seen in a running build. Board `Progress`. The update dialog is not wired
into the tray, and draft recovery for editors is design only (see [`draft-recovery.md`](draft-recovery.md)).

## What it does

Work that takes time (a download, an import, a backup) reports to a small in-memory list. The
activity tray shows that list, so a task stays visible after the page that started it has been
left. A failed task shows a recovery card that says what happened and, where one exists, offers
Retry.

- `frontend/src/common/activity/activity-store.ts` keeps the list. Finished activities are kept
  for display up to a limit of 12; running ones are never dropped. Nothing is stored across a
  reload.
- `frontend/src/components/activity/ha-activity-tray.ts` draws the tray and
  `ha-recovery-card.ts` draws the card.
- `activity-backup-bridge.ts` mirrors backup progress the backup page already receives.
  `activity-announcer.ts` announces changes to screen readers.

## Rules the store keeps

- Progress is only what the caller measured. A value that is not a finite count with a positive
  total is dropped and the activity shows as running with no percentage. No remaining time is
  estimated and no percentage is invented.
- Cancel is offered only when the server can really stop the work. Undo and Retry appear only
  when the caller supplied one.

## Failure modes and security

- A failure's technical text is redacted before it is copied or shown: credentials in addresses,
  authorization and cookie header lines, bearer values, signed-token shapes and values whose key
  names a secret are replaced with a placeholder (`redact-details.ts`). It errs toward hiding.
- Labels already arrive localized from the caller; nothing in the tray puts details in an address
  or a log.

## How it was checked

Unit tests in `frontend/test/common/activity/activity.test.ts` pass. The tray and the card were
not opened in a browser.
