# Notes and "What's new in build N"

Both open a build's own page on the public updates log.

## Published link coverage on 22 November 2026

Of the 130 Home Assistant Material release tags, 68 had a matching public build page. Each of
those pages returned HTTP 200 at its original address and displayed the matching build number.
The other 62 returned HTTP 404. Build 548 opens directly at its [build notes](https://ding-ding-projects.github.io/home-assistant-material-updates/releases/548/).

The 130 product release descriptions and 19 Deploy Assistant release descriptions contained no
links to those notes pages. Across all 149 descriptions, 129 linked to a build run, 16 linked to
a photo and four contained no web link. Inside the product, all 258 entries in the bundled
changelog have source links. Sixteen also offer a link to the screen named in the entry. The
13 focused release-note tests passed. This inventory describes the links as published on that date.

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

The Updates page showed two "What's new" buttons; it keeps one (`6db767de3`). A browser look at
`71824ce14` then found the button missing entirely, the opposite of what was asked; that commit
makes the page always show exactly one. Neither commit is in a released build yet; a release for
`a3cb56d37`, which carries both, was dispatched on 18 November and is not yet verified.

## Verification

The version-to-page rule is tested. In the integration look of 18 November, on a local build of
the tree (not a released build), at 390 px in dark theme and both-language mode, the Updates page
showed exactly one "What's new" button both with the build list reachable and with every request
off the host blocked; when blocked it shows the quiet line "You already have build 525" beside the
button. The finished update card's link and the offered-build link were still unverified at that point.

On 22 November, an isolated installation running stock Core 547 offered Core 548. The visible
**Read release announcement** link in the update sheet pointed to the [548 notes](https://ding-ding-projects.github.io/home-assistant-material-updates/releases/548/).
The **What's new in build 547** button on Updates linked to the [547 notes](https://ding-ding-projects.github.io/home-assistant-material-updates/releases/547/).
After the separate backed-up update completed, the finished summary linked to 548. Both
version pages returned HTTP 200 and displayed their matching build heading.
