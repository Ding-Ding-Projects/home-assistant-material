# String builder

Built in batch 53. A way to write text that accepts a template without writing the template by hand.

## What it does

A "Build text" button sits on action text fields and on the template editor. It opens a builder
that assembles the text from pieces:

- text
- the state of an entity, or one of its attributes
- the name, area or floor of an entity
- the date and time
- time since or until something
- numbers, rounded, with simple arithmetic
- comparisons, with a "then" and an "else" part (nested once)
- counts of entities in a state
- a raw template, kept exactly as written

A live preview asks the server to render the result. The builder writes the template and can read
one back: a template that it wrote opens again as the same pieces, and any part it does not
recognise stays as a raw piece instead of being rewritten.

The model lives in `frontend/src/common/string-builder/` and the dialog in
`frontend/src/components/string-builder/`. The design lane's "Add trigger, condition and action at
the top" control was merged with this batch.

## Limits and failure modes

- The preview is rendered by the server, so it needs a connection.
- Comparisons nest one level only.
- The builder's own text is English only for now.

## How it was verified

14 model tests cover writing and reading back. The dialog was not seen in a browser. State: built,
unit tested, not yet seen in a running build.
