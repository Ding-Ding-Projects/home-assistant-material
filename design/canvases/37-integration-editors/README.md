# Canvas 37: rich editors for every integration

Four boards for the rule that every one of the 1577 integrations gets rich editors: its own actions, its own triggers and conditions, its setup form, and every built-in entry of the automation editor. All boards are drawn as real screens of the app in its dark theme at phone width (390 px), with the same top bar, cards, tile controls and bottom bar as the rest of the product.

| Board | Page | What it shows |
| --- | --- | --- |
| `Main.dc.html` | Unique editors | Interactive. Three editors that exist nowhere else: a message with reply buttons, a robot vacuum cleaning rooms in a chosen order, and a radio device setting with each part of its value as a toggle |
| `Families.dc.html` | Ten families | The "Add an action" picker with its ten groups, one group opened, the six things every editor shares, and how the 1577 integrations divide |
| `Setup.dc.html` | Setup forms | Interactive. Adding an integration as a bottom sheet: a device on the home network, signing in at a provider for cloud storage, and which control each kind of field gets |
| `When.dc.html` | Triggers and conditions | A trigger from an integration, a numeric condition showing the present value, and a building block (wait until) with its own editor |

## Rules the boards carry

- An editor is a screen of the app, not a poster: no hero headings, no oversized numerals.
- The device card with its present state sits on top; required fields come first, each in its own card; advanced fields are folded.
- Limits, steps, option lists, rooms and settings come from the device or integration itself.
- A test button says what it will really do. Sign-in happens on the provider's own page; a password is never typed into the app for it.
- The code view is one tap away and round-trips unchanged.
- Rows are 52 to 56 px and touch targets at least 44 px.

## Status

Design references. Nothing here is shipped behaviour until it is built and seen in a real build. The boards were made without filming or rendering frames; they are reviewed by using them on the canvas. Counts on the Families board (actions per group) are illustrative.
