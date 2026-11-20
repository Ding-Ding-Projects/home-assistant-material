# Updates

What the Updates page shows and does while updates are available, running or finished. The page
is Settings, System, Updates. The server side of the backup choice and of automatic updates lives
in `core/homeassistant/components/auto_update/`.

| File | Feature | State (current state: `../../../ROADMAP.md`) |
| --- | --- | --- |
| [`progress-and-queue.md`](progress-and-queue.md) | Real stages, numbers and output on every update row; the "Update everything" queue; honest start times and durations; compact rows on a phone | Seen in a local build for part of it; the rest built and tested only, see the file |
| [`update-coming-soon.md`](update-coming-soon.md) | The one "Update coming soon" card for a build that is being made but not yet published | Seen in a local build with a mocked response; not seen against a real build in progress |
| [`backup-before-updating.md`](backup-before-updating.md) | Choosing which updates get a backup first: system updates only, every update, none, or chosen apps | Written and tested; not yet seen in a browser or on a real update |
| [`going-back.md`](going-back.md) | Going back to an earlier build: a backup is always made and checked first, held by the Supervisor; the super confirmation with four games is the only way past it | Built and unit tested; not yet seen in a browser, no real going back run |
| [`whats-new-and-notes.md`](whats-new-and-notes.md) | The Notes button and "What's new in build N", both opening the build's page on the public updates log | Written and tested; not yet seen in a browser |

On the Updates page the search of the "What changed" list also lives in the top bar; see
[`../interface/top-bar-search.md`](../interface/top-bar-search.md).

Related, documented elsewhere:

- [`../apps/install-progress.md`](../apps/install-progress.md) for app installs and the log terminal.
- [`../hosting/offline-update-pack.md`](../hosting/offline-update-pack.md) and
  [`../hosting/usb-recovery.md`](../hosting/usb-recovery.md) for updates from a USB stick.
- [`../backups/backup-progress.md`](../backups/backup-progress.md) for the backup that can run
  before an update.

## The "Update everything" run in every browser

The browser that starts "Update everything" drives the run: it installs one update at a time, in
its own order, and keeps its queue in that browser's session storage. So that a second browser can
show the same progress ("Updating 2 of 2"), the driving browser also reports a small display record
to the server, and every other browser reads it.

- The record holds the update entity ids in order, the position (1-based), the total, the state
  (`running`, `done`, `failed` or `cancelled`), the update being worked on, and when the run
  started and last changed. It lives in memory only in `auto_update/run_record.py`.
- It is display only. It never starts, orders, retries or cancels an install; only the driving
  browser does that.
- A browser without its own queue shows the record read-only: the same title and progress, the
  steps, the start time in 24-hour form and the line "This run was started in another browser and
  can only be stopped there." It has no Stop, Try again or Skip button. While the run is running or
  failed it does not offer its own "Update everything" either. An ended run can be closed in that
  browser only, which hides it there.
- Because the record only says where the run is, a step the run moved past is shown as "Finished",
  never as installed (it may have been skipped), and a stopped run claims no result per step.
- The record disappears when the driving browser closes its finished card, two hours after its
  last change, and when Core starts (it is not stored). After a Core restart the driving browser
  reports it again once it is connected.
- Websocket commands, all for administrators only: `auto_update/run/get`, `auto_update/run/set`
  (`entity_ids`, at most 50 existing `update.*` entities without duplicates; `position` within the
  run; `state`; optional `current`, which must be in the run), `auto_update/run/clear` and
  `auto_update/run/subscribe` (sends `{"run": record or null}` now and on every change or expiry).
- A queue of more than 50 updates is not shared; it still runs in its own browser.

Tests: `core/tests/components/auto_update/test_run_record.py` and
`frontend/test/panels/config/core/update-run-share.test.ts`. Not yet seen in a browser.

## Automatic system updates

Core, Supervisor and the operating system may update by themselves, by owner decision of 17
November 2026. Three switches on the Updates page control this. All are off until the owner turns
each on behind the two-key confirmation. Updates run inside a window (03:00 to 05:00 by default),
after a wait of a chosen number of days, in a fixed order. USB install, USB recovery and going
back to an earlier build are never automatic.

A real run on build 509 found that turning any of the three switches on asked for confirmation
and then failed to save, because the switch sent the browser's list of shadow parts instead of the
word "core". It failed closed: nothing was saved, so nothing updated by itself. The property was
renamed (`systemPart`; the time control in the more-info dialog became `timePart`) in
`a6886fe92`. The fix has not yet been seen saving on a real build, and no automatic system update
has yet been watched happening inside its window.

### What off means

With a switch off, nothing installs that part until the owner presses Update. "Check for updates",
joining or leaving the beta channel and the regular checks only look: they show what is new and
install nothing. "Update everything" and "Update the Supervisor first" are presses too, so they
still install what they list.

The Supervisor used to have a second, separate setting of its own (`auto_update`, on by default)
that the switch never touched. Every check for updates told the Supervisor to look again, and with
that setting on the Supervisor then installed its own update straight away, outside the switch and
the window. That is how a check for updates moved a live instance from build 2026.11.0.527 to
.528 on 19 November 2026 with every switch off.

Now there is one way in for each part:

- The Supervisor's own setting is off by default, and Home Assistant turns it off whenever it finds
  it on, at start and at every refresh. Until that has worked, a check for updates does not ask the
  Supervisor to look again. The Supervisor is installed only through its update entity: an Update
  press, or its switch inside the window, with the wait and the backup choice.
- If the Supervisor still reports its own setting on (for example because turning it off failed),
  the Supervisor row shows a warning line with **Turn off now**.
- Supervisor plugins (cli, dns, audio, multicast, observer) no longer update by themselves on a
  schedule or at start. When an install that someone started (an Update press or an automatic
  update the owner switched on) needs current plugins, it updates them first, as part of that
  install. A missing or broken plugin is still installed or repaired at start.
- Core and the operating system had no live second path: they install only from a press or from
  their own switch. An older Core-only automatic patch updater in the Supervisor integration still
  exists, but nothing on the page can turn it on, so it never runs.
- Setting the Supervisor's own setting back on by hand does not last: Home Assistant turns it off
  again at the next refresh.

On a running instance the Supervisor's own setting can be turned off by hand with
`ha supervisor options --auto-update=false`.
