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

## The release link in an update sheet

The link to the release notes in an update sheet pointed at the build that was already installed.
It now points at the build on offer (`c9e3a5e67`); build 523 still has the old behaviour. The
updates log page itself marks the words a release notes search finds and steps through them (also
`c9e3a5e67`; see [`../interface/top-bar-search.md`](../interface/top-bar-search.md)).

The release link fix is in build 2026.11.1.524 but was not proven there: proving it needs a newer
build on offer. A verification of build 525 is running to settle it; no result is recorded yet.
Release notes search marking and stepping through the words it finds was seen working in a real
run of 524.

## One "What's new" button

The Updates page showed two "What's new" buttons; it keeps one (`6db767de3`, on main, not built,
unit-tested only).

## Verification

Only the version-to-page rule is tested. Neither button has been seen in a browser on a real
build.
