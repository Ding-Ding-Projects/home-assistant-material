# Scenes edited on paper, and the raw editor's Replace entity

Built in batch 47 from design canvas 31.

## Scenes

Editing a scene changes only its stored states and calls no service. Preview asks first, applies
the scene for 30 seconds and then restores from a snapshot scene; "Go back now" ends it early. The
dialog says what cannot be restored exactly (for example a state a device does not report).
Live Edit and Try it are unchanged.

## Raw configuration editor

- Go to line.
- A status bar with line, column, valid or not, and the match count.
- A Replace entity panel with whole-ID matching and a preview before anything changes.

The find panel is still the code editor's own.

## Limits and failure modes

- A restore from the snapshot scene is not guaranteed to be exact; the dialog says what cannot
  be restored.
- Replace entity works on whole IDs only, so `light.kitchen` never changes `light.kitchen_2`.

## How it was verified

Unit tested. Not seen in a browser. State: built, unit tested, not yet seen in a running build.
