# Notes on devices and entities

Built in batch 52. A free-text note can be attached to a device or an entity and is shown on its
page.

Notes are kept in the shared frontend settings under the key `registry_notes`, so they follow the
person's account across browsers. Nothing changes on the device or the entity itself, and no
other service receives the text.

## Limits and failure modes

- Notes are plain text and are visible to everyone who can open that page.

## How it was verified

Unit tested. Not seen in a browser. State: built, unit tested, not yet seen in a running build.
