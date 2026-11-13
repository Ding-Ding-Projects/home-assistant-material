# Pattern workbench additions

The pattern workbench (a button on every search field) gained these in batches 46 and 48.

- **A step trace of its own.** The workbench shows how a pattern is matched step by step.
- **Python and PCRE import.** Patterns written for those dialects can be imported into the workbench.
- **Search in files picked from the device.** A file is read in the browser and searched; it is
  never uploaded.
- **Encodings.** Text can be read in a chosen encoding.
- **Layout.** Three columns on wide windows; a bottom sheet on a phone.

## Limits and failure modes

- Searching the instance's own configuration files is not built. It needs a server call that
  reads files, which is a security decision left to the owner.
- Matching is bounded in time and size like the rest of the workbench; a pattern refused as
  unsafe is not run.

## Privacy

Files picked on the device are read locally; nothing leaves the browser.

## How it was verified

Unit tested (the regex tests pass). Not seen in a browser. State: built, unit tested, not yet
seen in a running build.
