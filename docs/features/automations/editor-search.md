# Search in the automation and script editor

The manual editors for automations and scripts can be searched as a whole, each
nested list can be searched on its own, and the editor can be filtered to the
steps that use chosen entities. Searching only reads the configuration: it never
changes it, never marks the editor as modified and never saves.

## The editor search

A search bar sits above the first section of the editor (triggers, conditions
and actions in an automation; the actions card in a script). It is sticky, so
it stays in view while the editor scrolls.

- **Field.** Plain text by default, with the pattern workbench button beside it
  (`ha-input-search`). A pattern is written `/pattern/flags`. A pattern that is
  invalid, too long or marked high risk is reported under the field and is never
  run; it matches nothing.
- **What is searched.** Every trigger, condition and action at every depth:
  Choose options and default actions, if/then/else, repeat (count, while, until
  and its sequence), parallel branches, sequences, nested and/or/not conditions,
  wait for trigger. For each step the searchable text is: the description as the
  row shows it, the alias, the note, the type (identifier and localized name),
  entity ids with their friendly names, device, area, floor and label names,
  service names, template text, and every string and number in its data.
- **Count and navigation.** "3 of 12 matches", Previous and Next buttons, Enter
  for next and Shift+Enter for previous inside the field, Escape to clear.
  Moving to a match opens the collapsed ancestors of that match and scrolls it
  into view (smooth scrolling is turned off when the browser asks for reduced
  motion). Matching rows are outlined with a dashed line; the current match has
  a solid, thicker line.
- **Show only matching steps.** A switch hides the rows that do not match and
  keeps the ancestors of every match. Hidden rows are not removed, so the order
  and indexes do not change. While rows are hidden, dragging, the drag handle by
  keyboard and the Move up and Move down menu items are turned off; the handle
  explains why in its tooltip.
- **Clearing.** Clearing the search closes exactly the rows the search opened
  and leaves rows the person opened alone.
- **Accessibility.** The bar is a `search` landmark, controls are at least 44 px
  high, the count is announced politely in a status region with the current
  step's description, and the layout is logical-property based for right to left
  languages. It wraps to one column at 320 px.
- **Languages.** Strings are under `ui.panel.config.automation.editor.search`
  in English and Cantonese and follow the language mode.

## The entity filter

The Entities button opens a panel listing every entity the steps use, with the
friendly name, icon, entity id and the number of steps that use it. It has its
own search field (with its own pattern workbench), a choice of listing it flat,
by device or by area, and a checkbox per entity. Choosing entities filters the
editor to the steps that use any of them, ancestors kept, and combines with the
text search (both must match). Chosen entities also appear as removable chips.

Entities are collected for each step from its own fields only, so "steps using
this entity" is exact:

- `entity_id` fields, as a string, a comma separated string or a list;
- targets (`target.entity_id`), including legacy `entity_id` on actions;
- entity registry ids, as device triggers, conditions and actions store them,
  resolved to entity ids;
- any other string value that is exactly the id of an existing entity (the key
  names an action, service, trigger platform and similar are excluded);
- entities named in template text, found by bounded regular expressions for
  `states('x.y')`, `is_state('x.y'`, `state_attr('x.y'`, `is_state_attr`,
  `has_value`, `state_translated`, `expand`, `states.x.y` and `states['x.y']`.
  The text scanned is cut to 20,000 characters and at most 100 entities are taken
  per step. An entity found only this way is labelled "from a template".

An entity that is not in the state machine is listed and marked "not found".
Device targets that name only a device do not add entities.

## Searching a nested list

Every nested list (Choose options, the then and else lists, a repeat's sequence,
parallel branches, nested condition groups, the conditions and actions inside a
Choose option) has its own small search field with its own state, independent of
the editor search. It filters that list only, by everything inside each row (a
row stays when anything nested in it matches). It reports "N of M shown" or that
nothing matches, and turns reordering of that list off while it filters.

- The field appears by itself when the list has **5 or more rows**
  (`LIST_SEARCH_THRESHOLD`).
- Below that, a search icon button in the list's button row opens it, and a
  close button hides it again.
- Root lists (the three lists of the editor) use the editor search instead.

## Pickers the editor opens

Already searchable, with the pattern workbench: the Add trigger, condition and
action dialog (its own field, plus the search of targets, blocks and items), the
new automation dialog, and every picker built on the combo box (entity, device,
area, floor, label, service, icon, config entry, language, target picker and the
selectors built on them, including a select selector in dropdown or custom value
mode and the multi select picker).

Added: a select selector shown as a list of radio buttons or checkboxes now has
a search field from 8 options on (`ha-selector-select`).

Not searchable: a select selector that falls to a plain dropdown (`ha-select`),
the box style (`ha-select-box`, meant for a handful of options) and the target
details dialog. These are shared components outside the editor.

## Limits

- Matching is on the configuration as edited, including unsaved changes. A
  condition written as a bare template string is searched as part of the step
  that holds it, not as a row of its own.
- The "not found" mark of an entity follows the state machine live; names used
  for matching are read when the configuration or the registries change.
- The default actions of a Choose written as a single object (not a list) are
  found, but the default row is not opened automatically.
- The sidebar holds no nested lists (a container step's content is shown in the
  editor), so it has no list search.

## Where the code is

- `frontend/src/panels/config/automation/search/automation-search.ts`: pure
  flattening, entity collection, matching.
- `.../search/ha-automation-search-scope.ts`: owns the search state and shares
  it through a Lit context; `.../ha-automation-search-bar.ts`: the bar.
- `.../ha-automation-sortable-list-mixin.ts`: marks, hides and opens rows and
  renders the search of each list; the four list components use it.
- Tests: `frontend/test/panels/config/automation/automation-search.test.ts`.

## Verified

See the "State" column in `README.md`. Unit tests cover every nesting form,
templates, missing entities, pattern search, invalid and risky patterns, and
that the configuration is never changed. The browser results of the build are
recorded in the report of the change that added this page.
