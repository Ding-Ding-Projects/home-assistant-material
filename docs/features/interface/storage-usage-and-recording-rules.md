# Storage usage and per-entity recording

Added to the Storage page in batches 47 to 50. Two parts: numbers read from the recorder, and
rules that change how often one entity is recorded.

## Storage page

A ring with the measured database size, a growth chart, the biggest entities, and a per-entity
view with an estimated saving before a purge (the purge needs a typed confirmation). The
overview loads on the page's first update (batch 50 fixed a defect where it asked before the
connection existed and reported that it could not be read).

## Server calls (administrators only)

| Command | What it returns |
| --- | --- |
| `recorder/storage/overview` (`limit`, 1 to 200) | The SQLite file size, table size, 14 days of growth and the biggest entities |
| `recorder/storage/entity` (`entity_id`, `days`, 1 to 30) | Rows per day and the number of days kept |
| `recorder/entity_options/get` | The recording rule of one entity |
| `recorder/entity_options/set` | `recording_disabled`, `min_interval` (0 to 3600 seconds) and `always_on_change` |

Code: `core/homeassistant/components/recorder/storage_usage.py`, `entity_options.py`,
`entity_rules.py`. Queries run in the recorder executor and are bounded.

## Recording rules

Rules are kept in `.storage/recorder.entity_options` and applied at once, without a restart. The
recorder consults an in-memory rule set beside the YAML filter, which stays authoritative: an
entity excluded by YAML stays excluded. With a minimum interval, a repeat of the same value
inside the interval is dropped. **A change to a different value is recorded at once** unless
"always on change" is turned off, so the history never loses a change of value by default. The
Storage page offers "Keep history" and "Record at most once every..." with the estimated saving
shown first.

## Limits and failure modes

- The file size is read for SQLite; for other database types the numbers are whatever the server's own queries report.
- Rules apply to new rows only; existing rows change only through the purge.
- A purge deletes data and cannot be undone; it asks for typed confirmation.
- The recorder commits every 5 seconds, so a count taken right after a change lags.

## Privacy

Everything stays on the instance. The overview exposes entity IDs and row counts to
administrators only.

## How it was verified

The three changed server files were mounted into a throwaway container of build 348 and
driven over the websocket. Overview: file size, table size, growth and biggest entities came back;
a limit of 9999 was refused. Entity call: rows per day and keep days came back. Rules: with two
test sensors, switching one off stopped its rows while the other kept gaining, switching it on
resumed it, with a 60 second interval two repeats of one value added no row and a new value added
one, 3601 seconds was refused, and the storage file was written. pytest for these files has not
been run: this machine's Python lacks the product's packages. The page itself: the overview said
it could not be read in published build 371 (fixed in batch 50, not seen again). The Keep history
switch and interval field are unit tested, not seen.
