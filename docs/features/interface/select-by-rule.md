# Select by rule

Built in batch 50, in every settings list that has a selection bar.

## What it does

A rule picks rows instead of ticking them one at a time. Conditions: text contains, does not
contain, starts with, ends with or matches a pattern; has or does not have a label; area,
integration, domain and state. Conditions combine with all, any and not. The result is applied
as replace, add, remove or keep only, and a live count is shown before anything is applied.

## Limits and failure modes

- A rule selects rows; it does not act on them. The usual previews and confirmations of bulk
  actions still apply afterwards.
- Patterns go through the shared matcher, which limits its time and size like every search.

## How it was verified

Unit tested (the select-by-rule, translations, native controls and regex tests pass). Not seen in
a browser. State: built, unit tested, not yet seen in a running build.
