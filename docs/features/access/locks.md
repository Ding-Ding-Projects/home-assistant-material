# Locks

Code: `frontend/src/common/locks/`, `frontend/src/components/locks/`,
`frontend/src/components/page/ha-page-tools.ts`.

## What it does

A page, a dialog or a single element can be locked so it stops taking clicks and keys. The
lock is a guard against accidents and a speed bump, not a replacement for accounts. It is kept
in this browser only, and clearing the site's storage removes every lock.

- Page and dialog locks: unlock with a 1.5 second hold, or the shared PIN (4 to 12 digits,
  stored as a salted hash). After the third wrong PIN in a row there is a wait of 5 seconds,
  then 15 seconds, 1 minute and 5 minutes; tries during a wait are refused.
- Element locks: Lock this element in the right-click menu. The element is outlined with
  dashes. The Lock tool lists the locked elements of the page.
- Locks with their own credentials: a lock chooses one of six ways in (PIN, password, PIN and
  password, password and one-time code, PIN and one-time code, all three). A six-step wizard
  with a progress line and a QR code for the one-time code sets it up and can try the new lock
  before it is saved. The unlock prompt has a keypad and manual entry sharing one count of
  tries and counts down a wait. The list of locks filters and selects several.

Locks are never written to the local history.

## Verification

Page and element locks with a hold, and the wrong-PIN waits, were seen working
(`../../screenshots/page-tools-lock.png`, `element-lock.png`). Unlocking an element with the
PIN was not exercised. Locks with their own credentials and the wizard are checked by unit
tests only (the six ways in, hashing, one-time codes against the published test values, the
shared count of tries, one lock not opening another) and have not been seen in a running build.
Not built: locks on tabs and on appearance values, the support desk, and the board's other
unlock rungs.
