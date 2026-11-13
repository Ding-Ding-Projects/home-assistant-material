# Pop-up cards, card styling and history compare

Built in batches 47 and 48.

## Pop-up cards

"Open a pop-up" is a tap, hold or double-tap action. The action has a card list editor. Pop-ups may
be nested three levels deep at most.

## Card styling without an add-on

A Style tab in the card editor sets text size and colour, icon colour, background, border, corner
radius, padding and shadow. Values are checked as lengths and colours before they are saved, and
are applied as custom properties on the card host, so nothing is injected as free CSS. Tap
feedback is set in the Interactions tool.

## History compare

The history graph accepts fixed axis limits and a colour per entity (these already existed) and
can now compare with an earlier period, drawn as a second dashed series.

## Limits and failure modes

- Only values that validate as lengths or colours are applied.
- Styling reaches only what a card reads from its custom properties; it cannot restyle a card
  that ignores them.

## How it was verified

Unit tested. Not seen in a browser. State: built, unit tested, not yet seen in a running
build.
