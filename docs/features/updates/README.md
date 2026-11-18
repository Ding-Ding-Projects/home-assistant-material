# Updates

What the Updates page shows and does while updates are available, running or finished. The page
is Settings, System, Updates. The server side of the backup choice and of automatic updates lives
in `core/homeassistant/components/auto_update/`.

| File | Feature | State (see `../../feature-status.md`) |
| --- | --- | --- |
| [`progress-and-queue.md`](progress-and-queue.md) | Real stages, numbers and output on every update row; the "Update everything" queue; honest start times and durations; compact rows on a phone | Seen in a local build for part of it; the rest built and tested only, see the file |
| [`update-coming-soon.md`](update-coming-soon.md) | The one "Update coming soon" card for a build that is being made but not yet published | Seen in a local build with a mocked response; not seen against a real build in progress |
| [`backup-before-updating.md`](backup-before-updating.md) | Choosing which updates get a backup first: system updates only, every update, none, or chosen apps | Written and tested; not yet seen in a browser or on a real update |
| [`whats-new-and-notes.md`](whats-new-and-notes.md) | The Notes button and "What's new in build N", both opening the build's page on the public updates log | Written and tested; not yet seen in a browser |

Related, documented elsewhere:

- [`../apps/install-progress.md`](../apps/install-progress.md) for app installs and the log terminal.
- [`../hosting/offline-update-pack.md`](../hosting/offline-update-pack.md) and
  [`../hosting/usb-recovery.md`](../hosting/usb-recovery.md) for updates from a USB stick.
- [`../backups/backup-progress.md`](../backups/backup-progress.md) for the backup that can run
  before an update.

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
