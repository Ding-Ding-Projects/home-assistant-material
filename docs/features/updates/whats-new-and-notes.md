# Notes and "What's new in build N"

Both open a build's own page on the public updates log.

## Notes on a system update

The Notes button beside Core, Supervisor and the operating system used whatever link the update
carried, which for the operating system led nowhere useful. It now opens that build's page,
found from the build number at the end of the version (2026.11.1.509 and 18.5.481 both end in
theirs). Integrations and apps keep the link their author gave. A version with no build number
falls back to the old behaviour. Commit `5fc4fbe08`; a small test pins the version-to-page rule.

## "What's new in build N"

The top block of the Updates page has a small button, for example "What's new in build 509", for
the build that is running. It is worked out from the running version, so it follows every update.
If the version has no build number the button is not shown. Commit `3cdb9adac`.

A finished update's card also carries a "What's new" link. Supervisor and operating system rows
did not have one when `4cb1fe589` was written.

## Verification

Only the version-to-page rule is tested. Neither button has been seen in a browser on a real
build.
