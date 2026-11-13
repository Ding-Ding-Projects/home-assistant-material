# Lock on one appearance value, and locking several pages at once

Built in batch 48.

## What it does

A single value in the appearance editor (a colour, a size) can be locked, so it cannot be
changed until unlocked. Several pages can be locked in one step. Both use the lock
credentials described in `locks.md`.

## Limits and failure modes

- A lock is a guard against slips and shared screens. It is enforced by the interface in the
  browser, so it is not access control for the instance.
- Locks on tabs are not part of this article; see `locks.md` for the current state.

## How it was verified

Unit tested. Not seen in a browser. State: built, unit tested, not yet seen in a running build.
