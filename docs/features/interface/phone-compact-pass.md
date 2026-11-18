# Phone compact pass and menus as sheets

The product is used on a 390 px phone, and the owner has said more than once that things must not
be big. Rows are 52 to 60 px, titles 22 to 26 px, tiles two across and short; large type and tall
heroes are for wide windows only. Earlier phone work is in [`phone-shell.md`](phone-shell.md).

Commits: `465bb72ba`, `a7f6196c6`, `117f536c0`, `11e60d596`, `900ceccca`, `28e6e9e7d`.

## Layout

- **One bottom bar.** Entities, Devices and every page using the same layout had three bars
  stacked at the bottom. Sub-tabs are now a scrolling row of pills under the title, and "Select"
  lives in the page's menu. The tab row fades at its scrolling edge.
- **Nothing wider than the screen.** The Settings front slid sideways because a long list of
  update names made one row wider than its card. Rows can shrink, the second line wraps to two
  lines, and the summary names two updates and then "and N more". A check on eight pages found
  nothing wider than the window.
- **Second lines wrap** instead of being cut after a few letters. Comfortable density is roomier
  but no longer bigger or bolder than Compact. Density (compact, comfortable, cosy) is a setting.
- **Type is capped.** The largest type on the Updates page fell from 72 px to 28 px; the same cap
  applies to the Settings front, device health, the greeting, developer tools and the away digest.
- **Update rows** are 66 px instead of 145 px; see
  [`../updates/progress-and-queue.md`](../updates/progress-and-queue.md).
- **Editors.** Simple, Advanced and YAML is one pill control under the title. Step rows are tonal,
  rounded and six pixels apart. Search is an icon that opens the field. The six starter tiles of an
  empty automation fit on one screen. Scripts and scenes have list pages with export and import.
- **Motion only where something happened:** a deleted step collapses, Save shows a drawn tick for
  a moment, the update queue ring fills and flashes once when it finishes. All follow the motion
  preference and stay still under reduced motion.

## Menus become sheets

A step's menu opened upward on the last step and lost its top, so Delete stayed out of reach.
Below 600 px every menu is now a sheet from the bottom with 48 px rows, scrolling inside itself and
sitting above the floating bars. On wide windows menus stay anchored but cannot grow past the
window. Sheet titles wrap to two lines.

## Scrolling

Measured at 390 px with the processor slowed four times (`6b6ac0e92`, `a7f6196c6`): elements
restyled per scroll on a 1,500-row list fell from 4,015 to 1,344, and every checkbox now applies
its validity states only when they differ. Main-thread cost of a fixed scroll fell 26% on Entities
and 16% on Automations; the share of slow frames only moved from about 18% to about 16%. The
remaining cost is the per-row cost of icons and custom elements. Not measured: Devices,
dashboards, the Logbook, touch gestures, and a real phone.

## Verification

- Seen in a local build at 390 and 360 px, light and dark (`117f536c0`): the Settings front, the
  single bottom bar, row wrapping, and climate and cover sliders dragged with a real pointer that
  kept their values through save and reload.
- Menus clicked at 390 and 360 px on the first, middle and last step, the editor's own menu and
  list rows (`28e6e9e7d`, a real run of build 519 on a phone).
- Not seen: the scenes menu at 360 px, the row editor sheet header, the saved tick, and the queue
  ring in a browser.
