# Dark mode readability check

Built in batch 52. A check that looks at text and its background in the dark theme and reports
combinations that are hard to read.

## Limits and failure modes

- It can report a problem; it cannot fix pages whose colours come from a custom card or a
  resource outside the interface. Those are listed as open work in `ROADMAP.md`.
- It measures colour contrast only. It does not judge size or spacing.

## How it was verified

Unit tested. Not seen in a browser. State: built, unit tested, not yet seen in a running build.
