# Performance diagnostics and offline cache health

Built in batch 52, under Settings, System, Performance.

## Performance

The page shows what the browser measured while a dashboard loaded: the time to the first finished
card and to the last, and a list of findings, slowest first. A finding is one of: a history graph
that reaches back further than 24 hours, a statistics graph further than 7 days, a card that took
over a second for its first draw, a picture with more than twice the pixels the card shows, or a
custom resource that was slow or large. Where a stored dashboard can change to help, a Fix button
does that. Where the choice is the person's, the finding links to the page where they act.
Thresholds are in `frontend/src/panels/config/performance/perf-findings.ts`.

## Offline cache

A second page counts stalls of the offline cache and offers a reset of it.

## Limits and failure modes

- Timings come from the browser that opened the page; another device may differ.
- A Fix changes the stored dashboard.

## How it was verified

Unit tested. Not seen in a browser. State: built, unit tested, not yet seen in a running build.
