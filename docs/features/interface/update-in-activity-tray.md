# Update installs in the activity tray

A running or just finished update install appears as a row in the activity
tray, so progress stays visible while you move around the interface.

## What a row shows

- The name of the update and its current stage: making a backup, getting ready,
  installing, waiting for Home Assistant to come back, checking the new
  version, installed.
- A progress bar when the update entity reports a percentage. Without one the
  bar is indeterminate; no number is invented.
- A note when the install has stayed on "getting ready" for a long time.
- When the install failed: the recovery card with the plain-words message, a
  Try again action (when the install can be sent again) and the technical
  details with credentials hidden.

Selecting **Show update** opens the update dialog of that entity again.
**Dismiss** removes a finished row, and **Clear finished** removes all of them.

## How long a row stays

A finished row leaves the tray one minute after it finished. A failed row stays
until it is dismissed or tried again. A restart that takes a long time is never
reported as a failed update: the row stays on "waiting" or "checking" until the
new version is read back or the tracker's own grace period for the version check
runs out.

## Where the data comes from

The rows come from the update install tracker
(`frontend/src/components/update-progress/update-install-tracker.ts`), which
follows each install outside any page. It exposes `subscribe`, `list()` and the
pure `deriveUpdateTrayRows(runs, now)`. The tracker's own plain activity entry
for the same install is left out of the plain list so an install is shown once.

## Privacy

Failure details pass through the same redaction as every other copied or
shown activity detail. Nothing is sent outside the instance.

## Verification

Row derivation is covered by
`frontend/test/components/update-progress/update-tray-rows.test.ts`. The tray
rendering was not seen in a browser.
