# Permanent record of the Activity page

Code: `core/homeassistant/components/activity_record/`, `frontend/src/panels/config/activity-record/`,
`frontend/src/data/activity_record.ts`, the "Permanent record" entry in the overflow menu of
`frontend/src/panels/logbook/ha-panel-logbook.ts`.

## What it does

The Activity page (the logbook) reads from the recorder database, and the recorder purges old
rows. This integration keeps a second copy that is never purged: every entry the Activity page
shows is also appended to a Git repository inside the configuration folder.

Nothing is ever deleted, rewritten, purged or squashed. **The record grows for ever by design.**

### What "never lost" means, and what can still be lost

The record is written for a small machine (a Raspberry Pi with an SD card), so it makes four
promises and no more:

- An entry that reaches the disk is kept for ever.
- A write that fails (disk full, read-only card) does not discard entries. The batch goes back to
  the front of the queue, in order, and is tried again after 5, 10, 30 and then every 60 seconds.
  Only the part of a batch that did not reach the disk is retried, so nothing is written twice.
- Entries are dropped only when the in-memory queue (5000 entries) is full. The first drop of a run
  is written to the record at once, in a slot reserved beyond the queue bound, with the time it
  started, and a summary with the count and the first and last drop time follows when the queue is
  empty again. The total is also kept in an ignored file beside the record, so it survives a
  restart.
- An entry that cannot be masked or written is not lost with its batch: a line of kind
  `unwritable` stands in for it and says why.

These entries can still be lost:

- Entries that arrive in the last few seconds before a power cut, a crash of the host or a kill of
  the process. They are held in memory for about 3 seconds before they are written (so that a
  quiet home does one disk flush for many entries, not one per entry), and a failed write keeps
  them only in memory until it succeeds. If Home Assistant stops while the disk is still failing,
  the final attempt at shutdown can fail too.
- Entries dropped because the queue was full (they are counted, and the count is on the page).
- Entries that happened while Home Assistant was stopped.
- Entries the Activity page itself never showed.
- The part of a line that was being written when the power went (an unfinished last line is left in
  the file, skipped on reading, and the next entry starts on a new line).
- The drop total of the last seconds before a crash: the opening drop line is queued at once, but
  the total in the ignored file is saved after the next write.
- Two Home Assistants on one folder: the second does not record (see below).

## What is recorded

Exactly what the Activity page shows. The integration does not define its own idea of an
event. It subscribes to the same live stream the logbook builds (`logbook/helpers.py`
`async_subscribe_events`, filtered with the logbook's own entity filter) and turns each event
into an entry with the logbook's own `EventProcessor.humanify`. So it records:

- state changes the logbook considers worth showing (continuous sensors are left out, as on the page),
- automation and script runs,
- entries other integrations describe through their logbook platform,
- manual logbook entries.

Event types that integrations register after start are picked up: they are checked every 3
seconds until Home Assistant has started, again when it has started, and then every commit
interval.

Each entry is one JSON line with: `when` (UTC, ISO), `kind`, `name`, `message`, `entity_id`,
`domain`, `state`, `context_id`, `context_parent_id`, `context_user_id`, and what caused it
(`context_entity_id`, `context_entity_id_name`, `context_domain`, `context_service`,
`context_name`, `context_message`, `context_source`, `context_state`), plus `item_id` and
`run_id` for automation and script runs. Other kinds of line: `dropped` (see above), `unwritable`
(an entry that could not be written) and `restored` (a hand edit was undone).

### Cut entries

Values are limited so a line stays small: text fields are cut at 2000 characters, at most 8
simple attributes are kept, and attributes that are not text, numbers, booleans or empty (lists,
nested values) are left out. An entry where anything was cut has `"cut": true`, and the page says
so. An entry whose time cannot be read is filed at the time it arrived and keeps the original value
as `when_raw`.

### What is masked, and what is not

Before a line is written, the text fields (`name`, `message`, `state`, `source` and the context
name, message, source and state fields) and the attribute keys and values go through the problem
log's redaction (`problem_log.problem_core.redact`) and every exact value in `secrets.yaml` is
removed. That hides values that look like passwords, tokens, bearer headers, URL credentials,
email addresses, long hexadecimal strings and long random runs. The object part of an `entity_id`
(and `context_entity_id`) and the `item_id` are replaced by `[removed]` when they look like a random
token. **Masking cannot be undone**: the original value is not stored anywhere.

Masking is a heuristic. These still land in the record as they are: short codes and PINs shown in a
state or message, names of people, devices and rooms, locations, calendar and to-do titles, the
values of text helpers, and anything else that does not look like a token. The page says so.
Treat the record as private.

## Where

`<config>/activity_record/`, a Git repository. Each UTC day is stored in chunks:

```text
activity_record/
  README.md
  .gitignore                    allows only README.md, .gitignore and YYYY/MM/*.jsonl
  .lock                         held while a Home Assistant records here (ignored)
  .activity_state.json          drop total and chunk counts (ignored)
  2026/11/2026-11-11.001.jsonl  chunks of one day, a new one at about 1 MB
  2026/11/2026-11-11.002.jsonl
  2026/11/2026-11-10.jsonl      a day file of the first version, read as chunk 0, never rewritten
```

A new chunk starts when the active one reaches about 1 MB (an entry is never split) and at the day
change. Only the active chunk changes, so a commit stores about 1 MB at most instead of the whole
day again, which keeps Git objects and repacking small. Listing, reading, counting and search group
the chunks of a day. Chunks of finished days are never opened for writing again.

The folder is part of the configuration folder, so it is **included in backups**, together with
its Git history.

## When it is written

- Entries wait in memory for about 3 seconds so one flush takes many entries (a flush starts at
  once at 1000 queued entries and at stop), then are written to the active chunk with one flush to
  disk per chunk. The folder is flushed too when a chunk or a folder was created.
- Commits are batched: at most one per `commit_interval` seconds (default **600**, 60 to 3600) and
  one when Home Assistant stops. Writing does not wait for a commit; the commit takes only a short
  moment of the write lock, to add the files.
- Only chunk files that were written (and the README and `.gitignore`) are added, by name. A
  stray file, a key or a note dropped into the folder is never swept into a commit, and nothing
  staged by hand is committed.
- A file that was deleted by hand, or a `.jsonl` file from which lines were removed or changed, is
  **not committed**. It is restored from the last commit (lines that were added are kept), a copy of
  the edited file is kept beside it (`*.hand-edited.<time>`, ignored by Git), a line of kind
  `restored` is written, and the status on the page shows it.
- After a crash the lines already on disk survive. The next start commits whatever is on disk. A
  `.git/index.lock` left by a Git that was killed (by the time limit or a power cut) is removed
  when it is older than 5 minutes, or at once when our own Git was killed by its time limit; it is
  never removed while a Git of this integration runs. Commits have a 180 second time limit.
- Home Assistant keeps recording until the final write stage of shutdown, then flushes and commits.
- Git is configured on every start with `gc.auto=500`, `pack.threads=1`, `pack.windowMemory=32m`,
  `core.bigFileThreshold=1m` and `repack.writeBitmaps=false`.
- One Home Assistant per folder: the folder is locked on start (`.lock`). When another process
  holds it, this one does not record and the status says so.

```yaml
activity_record:
  commit_interval: 900
```

## Size and cost

An entry is a few hundred bytes (a typical test entry is around 250 bytes). Plan on roughly
**0.3 MB of text per thousand entries**, and expect the Git history to add of the order of the
same again once packed (an estimate, not a measurement on a real installation). A home that
records 20 000 entries a day grows by roughly 6 MB of files a day, about 2 GB of files a year,
before Git's history. The folder is never pruned. Move or archive it yourself if disk space
becomes a problem.

Counting entries does not read the whole record: the lines of the active chunk are counted as they
are written, and the counts of the other chunks are kept in the ignored `.activity_state.json`
and rebuilt chunk by chunk when a file changed. Search reads at most 16 MB by default (64 MB at
most), one search at a time, tests the text on the raw line before parsing it, pauses regularly,
and stops when the page that asked has gone. Reading a day uses a cursor (a chunk and a byte
position in an append-only file), so "Show older entries" shows no duplicates while new entries
arrive.

## Safety and privacy

- Entries can contain names, places and state values. They never leave the instance unless an
  administrator sets a Git remote and presses Push now.
- The remote follows the same rules as the other history repositories: `https://`, `ssh://` or
  `git@host:path`, no user name, password, token, query or fragment, no loopback, link-local or
  unspecified address. Push is never forced. Every command is administrator only.
- **SSH key.** Git runs with its home in the record folder, but SSH is pointed at a folder outside
  it: `<config>/.activity_record_ssh/`. Put the private key there (`id_ed25519`, `id_ecdsa` or
  `id_rsa`, without a passphrase) and a `known_hosts` file that lists the host (host key checking
  is strict, so an unknown host fails). SSH does not read any other configuration or key. A key
  in that folder is never inside the repository, so it is never committed or pushed. An **https
  remote cannot sign in here** (no password or token is accepted), so use an `ssh://` or `git@`
  address; a public https remote can only be read. The page shows the folder.
- A push runs in the background, in steps of at most 200 commits, so a long first push does not
  need one transfer that fits in 5 minutes; the page shows "step N of M". A later push resumes from
  what the remote already holds.
- All file and Git work runs in the executor. The in-memory queue is bounded (5000 entries). A
  failure is logged once, not per event, and shown in the status.

## WebSocket commands (administrator only)

| Command | What it does |
| --- | --- |
| `activity_record/status` | Entries today and in total, days, files, size, last commit, uncommitted entries, queue depth, dropped total, last error, retrying, lock held, hand edits undone, remote or none, push progress, SSH folder. |
| `activity_record/days` | Days that have a file, newest first, with entry and chunk counts. Optional `limit`, `offset`. |
| `activity_record/read` | One day (`day`) across its chunks, with an optional `cursor` (from `next_cursor` of the previous page), `limit` (up to 1000) and `newest_first`. |
| `activity_record/search` | Bounded plain-text search: `start`, `end` (days), `entity_id`, `text`, `limit` (up to 1000), `max_bytes` (default 16 MB, at most 64 MB). One at a time (error code `busy` otherwise); reports whether it was cut short and why. |
| `activity_record/set_remote` | Set or remove (`url: null`) the Git remote. |
| `activity_record/push` | Start a push in the background (answers `{"started": true}`); progress is on the status. |

## The page

Settings, System entries list "Permanent record", and the Activity page has a "Permanent record"
item in its overflow menu (administrators only, when the integration is loaded). The page
`/config/activity-record` shows what is kept and that nothing is deleted, the status (including a
lock held by another Home Assistant, a failed write that is being retried, the dropped total, the
last error, and hand edits that were undone), the days with counts, one day newest first (paged,
200 at a time by cursor; choosing an entry with a known entity opens its details), a search of
the loaded day with the pattern builder beside it, "Search all days" with its own pattern builder
(the server searches plain text only, so a pattern is applied in the page to the rows the server
returns, and the page says so), and the Git remote settings with the push progress and the SSH key
location. A direct visit when the integration is not loaded shows a plain "not available" message.

## Verification

Backend: the tests in `core/tests/components/activity_record/` (pure helpers, real Git in a
temporary folder, live recording through the logbook, WebSocket commands, admin only) pass in a
throwaway Linux container. They cover a failed write and its recovery in order, a partial
multi-day write, a placeholder for a bad entry, the drop record and its survival of a restart,
hand-deleted and hand-edited files being restored and not committed, stray and hand-staged files,
a stale `index.lock`, chunk roll-over, an old day file read as chunk 0, a second process on the
folder, crafted day and cursor strings, one search at a time, and cursor paging while new entries
arrive. The page has not been seen in a browser; its checks are lint, the template check, type
check and the search-field catalogue test.

Not done: a retention or archive tool (by design nothing is removed), pushing on a schedule
(a push is always asked for), and recording entries that happened while Home Assistant was
stopped (the recorder database is the only place those might exist, and they are not imported).
