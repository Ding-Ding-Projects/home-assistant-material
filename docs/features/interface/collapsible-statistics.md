# Collapsible statistics on list pages

List pages built on the shared list layout can show a strip of up to five
labelled numbers, such as the total, the number shown and the number selected,
above the table. The strip folds to a single summary line.

## What you see

- A strip above the table with the numbers, each with a label. On a phone
  (from 320 px) the numbers sit in two columns and wrap onto further rows.
  Wider, they fill one row.
- A toggle across the top of the strip. Folded, it shows one line with every
  label and number, for example "Total 12 · Shown 4 · Selected 0".
- The toggle is a button. It works with Enter and Space, reports
  `aria-expanded`, and is at least 44 px tall.
- The fold animates only when the system allows motion. With reduced motion
  the strip changes at once.

## Remembering the choice

The open or folded choice is kept in this browser for each page, under a key
built from the page's route. A page that has never been folded is expanded. A
stored value that cannot be read is ignored and the strip stays expanded.
When the browser blocks storage the choice lasts until the page is left.

## For pages that use the layout

Set the optional `statistics` property of `hass-tabs-subpage-data-table` to a
list of `{ label, value }` items. `value` is a number or text that is already
formatted. More than five items are ignored, in the order given. A page that
does not set the property is unchanged.

## Files

- `frontend/src/components/layout/ha-collapsible-statistics.ts`, the strip.
- `frontend/src/components/layout/collapsible-statistics-logic.ts`, the rules
  for the numbers, the stored choice and the summary line.
- `frontend/test/components/layout/collapsible-statistics-logic.test.ts`.

## Failure modes

- Storage blocked, full or damaged: the strip stays expanded and the choice is
  not kept.
- No statistics supplied: nothing is drawn.
