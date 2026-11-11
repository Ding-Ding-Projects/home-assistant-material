# Permanent record of the Activity page

Code: `core/homeassistant/components/activity_record/`, `frontend/src/panels/config/activity-record/`,
`frontend/src/data/activity_record.ts`, the "Permanent record" entry in the overflow menu of
`frontend/src/panels/logbook/ha-panel-logbook.ts`.

## What it does

The Activity page (the logbook) reads from the recorder database, and the recorder purges old
rows. This integration keeps a second copy that is never purged: every entry the Activity page
shows is also appended to a Git repository inside the configuration folder.

Nothing is ever deleted, rewritten, purged or squashed. **The record grows for ever by design.**

## What is recorded

Exactly what the Activity page shows. The integration does not define its own idea of an
event. It subscribes to the same live stream the logbook builds (`logbook/helpers.py`
`async_subscribe_events`, filtered with the logbook's own entity filter) and turns each event
into an entry with the logbook's own `EventProcessor.humanify`. So it records:

- state changes the logbook considers worth showing (continuous sensors are left out, as on the page),
- automation and script runs,
- entries other integrations describe through their logbook platform,
- manual logbook entries.

Event types that integrations register after start are picked up (checked at start-up
completion and every commit interval).

Each entry is one JSON line with: `when` (UTC, ISO), `kind`, `name`, `message`, `entity_id`,
`domain`, `state`, `context_id`, `context_parent_id`, `context_user_id`, and what caused it
(`context_entity_id`, `context_entity_id_name`, `context_domain`, `context_service`,
`context_name`, `context_message`, `context_source`, `context_state`), plus `item_id` and
`run_id` for automation and script runs.

## Where

`<config>/activity_record/`, a Git repository with one file per UTC day:

```text
activity_record/
  README.md
  2026/11/2026-11-11.jsonl
```

The folder is part of the configuration folder, so it is **included in backups**, together with
its Git history.

## When it is written

- Lines are written and flushed to the day file as they arrive (a short queue is written by a
  single executor job at a time).
- Commits are batched: at most one per `commit_interval` seconds (default 60, 10 to 3600) and one
  when Home Assistant stops. A busy home does not get a commit per event.
- After a crash the lines already on disk survive. The next start commits whatever is on disk.
  A line cut off by a crash is not glued to the next entry.
- Git is configured with `gc.auto=500` so the many small commits of a growing day file are packed.

```yaml
activity_record:
  commit_interval: 120
```

## Size

An entry is a few hundred bytes (a typical test entry is around 250 bytes). Plan on roughly
**0.3 MB of text per thousand entries**, and expect the Git history to add of the order of the
same again once packed (an estimate, not a measurement on a real installation). A home that
records 20 000 entries a day grows by roughly 6 MB of files a day, about 2 GB of files a year,
before Git's history. The folder is never pruned. Move or archive it yourself if disk space
becomes a problem.

## Safety and privacy

- Entries can contain names, places and state values. They never leave the instance unless an
  administrator sets a Git remote and presses Push now.
- The remote follows the same rules as the other history repositories: `https://`, `ssh://` or
  `git@host:path`, no user name, password, token, query or fragment, no loopback, link-local or
  unspecified address. Push is never forced. Every command is administrator only.
- Text fields are masked with the problem log's redaction (`problem_log.problem_core.redact`)
  before they are written: values that look like passwords, tokens, bearer headers, URL
  credentials, email addresses and long random runs, and every exact value in `secrets.yaml`.
  Masking is heuristic; the page tells people that the record holds names and places.
- All file and Git work runs in the executor. The in-memory queue is bounded (5000 entries).
  When it is full, entries are dropped and counted, and the count is itself written as an
  entry of kind `dropped`. A failure is logged once, not per event, and shown in the status.

## WebSocket commands (administrator only)

| Command | What it does |
| --- | --- |
| `activity_record/status` | Entries today and in total, files, size, last commit, uncommitted entries, queue depth, dropped count, last error, remote or none. |
| `activity_record/days` | Days that have a file, newest first, with entry counts. Optional `limit`, `offset`. |
| `activity_record/read` | One day (`day`), with `offset`, `limit` (up to 1000) and `newest_first`. |
| `activity_record/search` | Bounded search: `start`, `end` (days), `entity_id`, `text`, `limit` (up to 1000), `max_bytes` (default 64 MB, at most 256 MB). Runs in the executor, newest day first, and reports whether it was cut short and why. |
| `activity_record/set_remote` | Set or remove (`url: null`) the Git remote. |
| `activity_record/push` | Commit what is written, then push to the remote. |

## The page

Settings, System entries list "Permanent record", and the Activity page has a "Permanent record"
item in its overflow menu (administrators only, when the integration is loaded). The page
`/config/activity-record` shows what is kept and that nothing is deleted, the status, the days
with counts, one day newest first (paged, 200 at a time; choosing an entry with a known entity
opens its details), a search of the loaded day with the pattern builder beside it, "Search all
days" which uses the server search with a day range, and the Git remote settings with the same
warnings as the dashboard history page.

## Verification

Backend: 54 tests in `core/tests/components/activity_record/` (pure helpers, real Git in a
temporary folder, live recording through the logbook, WebSocket commands, admin only) pass in a
throwaway container. The page has not been seen in a browser.

Not done: a retention or archive tool (by design nothing is removed), pushing on a schedule
(a push is always asked for), and recording entries that happened while Home Assistant was
stopped (the recorder database is the only place those might exist, and they are not imported).
