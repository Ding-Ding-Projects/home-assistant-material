# Appearance and personal wording saved on the instance

Status: built, not yet seen in a running build.

## What it does

The appearance choices (per-element appearance, reading options) and the personal wording file are
saved on the instance for the signed-in account, under the frontend user-data keys, so another
computer or browser picks them up. They are included in backups of the instance. The browser copy
stays as a fast cache.

`frontend/src/common/instance-sync/user-data-sync.ts` keeps one browser-side setting in step with
the instance copy:

- A value that exists only in this browser is uploaded, never dropped.
- When both exist and differ, the one with the newer `updated` time wins and the page says which.
- Every value is checked with the owning feature's validator before use, because the instance copy
  is still input.
- Nothing leaves the instance's own websocket. A failed save is reported by status code only; no
  error text and no value is kept.
- A synced value is at most 768 KiB (`SYNC_MAX_BYTES`); saves are debounced.

Appearance uses `common/appearance/appearance-sync.ts` and wording uses
`common/vocabulary/wording-sync.ts`; a small status component
(`components/instance-sync/ha-instance-sync-status.ts`) says whether the copy is saved. The server
side is the existing `frontend/set_user_data` family in
`core/homeassistant/components/frontend/storage.py`.

## Two accounts on one browser

The browser cache records which account owns it (`instanceSync.owner`). When a different account
signs in, the cached wording, appearance, reading options, accessibility tools and their ages are
cleared before the first merge, so one person's private settings are never shown to, or uploaded for,
another account on the same browser. A cache that has ages but no owner is treated the same way.

A cache with no owner and no ages was made before this feature and was never synced. It is a one-time
migration: the first account to sign in after the update claims it and it uploads as before, so nobody
loses settings on upgrade. Trade-off: on a browser that two accounts shared before the update, the first
to sign in after it keeps the old browser-wide settings. Until the signed-in account is known, a cache
with a recorded owner is not applied.

## Failure modes

An invalid or oversized instance copy is not applied and the browser copy stays. What clearing the
wording file does to the instance copy has not been exercised.

## How it was checked

Server storage tests (36) and `frontend/test/common/instance-sync/user-data-sync.test.ts` pass. No
second computer has picked the choices up, and no backup has been restored to prove they come back.
