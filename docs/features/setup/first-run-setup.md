# First-run setup

Code: `frontend/src/onboarding/`, `core/homeassistant/components/onboarding/`.

## What it does

First-run setup has three steps: create the account, set the home's name, location, units and
time zone, and choose integrations. The account step shows password strength. The home step
shows a preview of how dates and units will look and asks the person to review before saving.

## What was removed

- The cloud restore and the links to outside sites on the Welcome screen.
- The analytics step (see `../help-and-privacy/problem-log.md`).
- The outside map lookup for an address: it contacts the outside map service only when a button
  that says so is pressed, behind a confirmation.

## Failure modes

- A configuration flow that fails to open must report back, so the integrations step cannot
  leave both buttons off. This is fixed in source (the dialog reports `flowFinished: false`)
  and is not seen in a running build.
- Enter on a focused button must not also save and advance. A handler guards this in
  `onboarding-location.ts`; it has not been exercised.

## Security

Nothing is sent out. Passwords are not logged by the interface.

## Verification

The Welcome screen was seen in a running build on 10 November 2026 and still showed the removed
upstream items; the fix is in source and not seen. Nothing else here has been opened. Open
items: the integrations step (device list, scan again) is not yet interactive, and the location
lookup may be removed entirely (decision pending in `../../HANDOFF.md`).
