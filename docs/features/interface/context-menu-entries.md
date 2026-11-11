# Context menu entries for what was clicked

Code: `frontend/src/components/appearance/context-menu-entries.ts` (the rules),
`frontend/src/components/appearance/ha-appearance-tools.ts` (the menu that shows them).
Tests: `frontend/test/components/appearance/context-menu-entries.test.ts`.

## What it does

The element menu (right-click, long press, the menu key or Shift+F10) now starts with entries that
belong to the thing that was clicked. They sit above the existing entries (open, edit appearance,
read aloud, copy, search, lock, page tools), are reached with the arrow keys and Enter like every
other entry, and are narrowed by the menu's own filter field.

| Clicked                                 | Entries                                                         |
| --------------------------------------- | --------------------------------------------------------------- |
| An entity row or card                   | Open details, Turn on or Turn off, Copy entity ID, Rename, Hide |
| A device row                            | Open the page of the device, Copy device ID                     |
| An area row                             | Open the page of the area, Copy area ID                         |
| An interface link that is not an anchor | Open in a new tab                                               |

Rules:

- Turn on and Turn off are offered only when the entity can be switched and its state is exactly
  `on` or `off`, and only the one that changes something. A cover, lock or climate device (open,
  locked, heat), an unavailable or unknown entity and a read-only entity such as a sensor get none.
- Entries that act on the home name the target in the label: "Turn off Kitchen", "Rename Kitchen…",
  "Hide Kitchen". Open details and the copy entries do not act on the home and stay short.
- Rename and Hide are offered only to an administrator and only when the entity is in the registry.
  Hide is not offered for an entity that is already hidden. Rename opens the entity dialog on its
  settings view, which holds the name field.
- An entity the home does not know (no state and no registry entry) gets no entries.
- A link that goes to another site gets no entry. An ordinary anchor keeps the existing Open and
  Open in a new tab entries and is never offered twice.

## How the target is found

`findTarget` walks up from the clicked element, across shadow boundaries, to the closest ancestor
that says what it is, and stops at a page layout or a dialog so a page's own id is never taken for
what was clicked inside it. Only data the elements already carry is read:

- attributes `data-entity-id` and `data-entity` (entity ids only), `data-device-id`, `data-area-id`;
- properties `stateObj.entity_id`, `config.entity` (a single id), `entityId`, `entity` and `href`.

A value that is not shaped like an entity id is ignored. The resolver itself
(`resolveContextEntries`) reads nothing from the page: it takes the target and plain facts about
the home and returns the entries, which is what the tests cover.

## Limits

- No device row or area row carries `data-device-id` or `data-area-id` today (only the vacuum area
  mapper carries a `data-area-id`, with another meaning). Device and area entries are built and
  tested but appear only once those rows carry the attributes.
- Rename for a device or area is not offered: the device dialog needs an update callback that only
  its page owns.
- Unhide is not offered; the registry display data cannot tell a user-hidden entity from one an
  integration hides.
- The English strings are under `ui.appearance_editor`, a block that has no Cantonese strings yet,
  so none were added.
- Nothing here has been seen in a browser.
