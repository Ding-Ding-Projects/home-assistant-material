# Sidebar names, outside links and the quick bar

Built in batch 52, under customisation.

- Sidebar entries can be renamed and given a default page to open.
- A choice of how outside links open.
- The quick bar can pin entries and remembers recent ones
  (`frontend/src/dialogs/quick-bar/quick-bar-memory.ts`).

Choices are kept per person in the shared frontend settings. Renaming changes only what the
sidebar shows, not the page.

## How it was verified

Unit tested. Not seen in a browser. State: built, unit tested, not yet seen in a running build.
