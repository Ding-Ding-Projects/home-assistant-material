# Update coming soon

While a newer build is being made but is not yet published, the Updates page shows one card,
"Update coming soon". It never installs anything. When the build is published, the card gives
way to the ordinary update offer.

## What it shows

Closed (about 120 px tall on a phone):

- the build number,
- the real percentage,
- a thin progress bar,
- how many jobs are done,
- the start time and the running time.

Open (the whole header opens it):

- each stage with its state,
- an estimate, labelled as coming from earlier builds,
- up to three things that will be in the build,
- what can be done now.

The card sits at the top of the page. An earlier version was several cards with poster-size words
and took more than a screen (`11e60d596`).

## Where the numbers come from

The percentage, jobs and start time come from the build progress that the build publishes beside
the update feed (inferred from the design and the commit history; the exact source file was not
re-read for this document). Nothing is estimated except the time, and that is labelled.

## When the build is installed

The card kept showing progress after the build it described was installed. On main
(`c9e3a5e67`) the build card goes quiet once that build is installed. Build 523 still shows
the fault. The fix is tested (`build-progress.test.ts`, `build-notes.test.ts`), and the quiet
build card was seen working in a real run of build 2026.11.1.524 (built from `c9e3a5e67`).

## Failure modes

The commit records do not state what the card does when the build record is missing or the build
fails. Check the source before relying on a particular behaviour.

## Verification

Seen in a local build at 390 px, with a mocked response for the build record (`11e60d596`). Not
seen against a real build in progress, and Cantonese was not seen rendered.
