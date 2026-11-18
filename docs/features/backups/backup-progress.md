# Backup progress

A running backup used to be five small bar segments in one line with their labels cut off, and a
blank button with a spinner. Commit `15f5ff0a6`; refined in `11e60d596` and `28e6e9e7d`. Design:
board 38 of `design/canvases/38-progress-drafts-entities`.

## What it shows

- **Stages as a list**, each with its full name and a state: Home Assistant, apps, folders and
  media, waiting for apps to restart, uploading, removing old backups.
- **One row per upload place**, with bytes done of total, a percentage, and speed and estimate
  once enough real samples exist. Start and finish times use the person's own time zone and clock
  choice (24-hour by default). A place that reports nothing gets an indeterminate bar and says so.
  One slow or failed place does not hide behind the others.
- **Live output** from the backup and storage logs, three lines by default, with secrets masked
  before anything reaches the screen or the clipboard.
- **The button** says "Backup running" and that it cannot be cancelled, because the server has no
  cancel command.
- **At the end:** size, duration and where the backup now lives, or the failed stage and place
  with the reason.
- Location cards are smaller. The run survives leaving the page and a reload.

## What the server does not provide

No numbers for building the archive itself, no events for delete, download or the self-check, and
no way to retry one upload place. None of those are shown.

## Verification

Seen in a local build: a real local backup with its stage list (`900ceccca`). Per-place upload
rows were not seen with a real cloud place. Stage times following the person's time zone were
changed in `28e6e9e7d` and not seen in a browser.
