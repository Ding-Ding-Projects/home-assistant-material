# Update progress, the queue and honest times

An installing update used to show a small spinner and three words. Each row now shows what is
actually happening, and the card that runs several updates in a row shows the whole run.

Code: the Updates page under `frontend/src/panels/config/` and the update progress components;
server part in `core/homeassistant/components/auto_update/`.

## What a row shows

- **A progress bar** with the percentage the update itself reports. When nothing is reported the
  bar is indeterminate and says so. It never moves on its own and never goes backwards.
- **Stages** for that kind of update (backup, download, unpack, install, restart, check). Each is
  waiting, running, done, failed or skipped, with a start time and elapsed time. An estimate is
  shown only after real movement has been seen, and it says it comes from earlier builds.
- **Live output**: the newest lines from the right log for that update, three shown by default,
  with secrets masked before anything reaches the screen or the clipboard. The "follow" control is
  a toggle button, not a native checkbox, which the repository forbids.
- **Waiting rows** say their place and the reason, for example "2 of 3, after Supervisor; restarts
  the system, so it goes alone".
- **A finished update** shows the from and to versions, how long it took, a tick, and a "What's
  new" link. A failed one shows the stage, the reason, the last lines and what can be done.
  Nothing retries by itself.
- **One line per row.** System names are shortened and the word "Update" dropped; the full name
  stays for screen readers.

## Where the start time comes from

An installing row takes its start from the first real source it finds: the page's own start, the
Supervisor job's time, the queue, or the moment this page saw the update begin. With none of
those, it says "Started before this page opened" and shows no running time. A duration is never
guessed.

A page opened in the middle of an update used to read the job list in a shape it did not
understand, so it never found the start time and showed the start as unknown for good. It also
told the reader the backup was "skipped by your choice" when nobody on that page had chosen
anything. Both are fixed on main in `c9e3a5e67` (a page opened mid-update now corrects itself
once the job's real start arrives, `23225de03`, and reads the job list correctly). Build 523 still
has the missing start time; the commit body says the false "skipped" line came from the same
cause.

An earlier version timed itself from the reload that follows an update, so a two-minute update
read "Took 0:05". The start is now kept from when the update began. This was fixed in
`28e6e9e7d`.

## Live output during a system update

During a Core, Supervisor or operating system update, the output reads the Supervisor's log,
filtered to that update, until the restart begins. Then it says the log cannot be read, and shows
the newest lines again once things are back (`a5bbfa5da`).

## Core waits for the Supervisor

A real run of build 523 showed that Core's update is refused until the Supervisor is updated. The
Core row used to try and be refused. On main (`c9e3a5e67`) it says "Update the Supervisor first"
instead. This was tested but not yet watched in a real update run. The fix is in build
2026.11.1.524, but proving it needs a newer build on offer; a verification of build 525 is
running to settle it, and no result is recorded yet.

## The automatic updates card and long names

The automatic updates card rests as one summary row instead of taking most of a phone screen
(`23225de03`). A long update name ends before its button, not under it (`090bf8e62`).

## The "Update everything" queue

- The card shows a clock that ticks once a second, counted from the first update that really
  started. The step in progress shows its own time beside "Updating". When the run ends, the card
  shows how long the whole run took. With no recorded start there is no time at all. The clock only
  runs while a queue is active (`3f969e067`).
- A finished run shows each step's time and the whole run's time. A Core step counts as done the
  moment the running version is the target. Up-to-date system rows are compact.
- Starting "Update everything" asks for the two-key confirmation. Updates are never started
  together; the queue runs them in a safe order.

## On a phone

At 390 px an update row went from 145 px to 66 px: badge, one-line name, versions and the Update
button. A chevron opens the summary, Notes and the Automatic switch. The largest type on the page
fell from 72 px to 28 px, and the same cap applies to the Settings front, device health, the
greeting, developer tools and the away digest (`11e60d596`).

## What the server does not provide

These are not shown, because showing them would mean inventing them:

- Download bytes and speed.
- Logs for individual integrations.
- Stage events for "came back" and the version check (these two are inferred).
- Apps show no size unless a past backup recorded one ("about N MB in the last backup").

## Failure modes and known faults

- **Row start time on a page opened mid-update.** Still missing in build 523, where a second page
  opened mid-update shows no start time. The cause (a job list shape the page did not
  understand) is fixed in `c9e3a5e67`, with tests, and is in build 2026.11.1.524. It was not
  proven in the real run of 524 (that needs a page that did not start the update, while a newer
  build is on offer); a verification of build 525 is running to settle it.
- **No live output during a Core update** was a gap in `4cb1fe589`. `a5bbfa5da` reads the
  Supervisor log; this was not seen on a real Core update.
- **A queue started by an older build** was not checked with the new rows.
- After the reload that follows an update, the Updates page used to sit on a blank spinner. A fix
  exists (`465bb72ba`) and was proven by simulation only.

## Security

Output lines are masked for secrets before display, copy or download. The queue never starts
Core, Supervisor or operating system updates without the owner's two-key confirmation.

## How it was verified

- Real run of build 2026.11.1.524 (a throwaway full hosting copy before it went live): Core
  updated from its row twice, taking 2:08 and 1:52.
- Real run of build 523 (a throwaway full hosting copy before it went live): Supervisor and Core
  updates from their rows. The run found the faults listed above; what exactly was read from the output
  lines was not recorded.
- Seen in a local build at 390, 360 and 1440 px: a running update with its progress and output,
  and nine pages with no sideways overflow and no console errors (`900ceccca`).
- Update rows used template entities and the "Update coming soon" card used a mocked response
  (`11e60d596`). The queue clock and the system-step output were not seen in a browser.
- Not seen: a real update on a real device, Cantonese rendering of the new strings.
