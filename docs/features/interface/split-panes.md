# Split panes and the resizable filter pane

Status: built, not yet seen in a running build. Board `Panels`. Collapsible statistics are not built.

## What it does

`ha-split-panels` (`frontend/src/components/layout/`) shows two sides with a movable divider. The
start side has a size in pixels; the end side takes the rest.

- The divider is a keyboard and pointer control (`ha-split-divider.ts`). The sizing rules are in
  `split-panels-logic.ts` and have unit tests.
- Either side can be folded away with a button on the divider; the other side then fills the width.
- The size and the folded side are remembered in this browser under the `storage-key` given to the
  component. A stored value that does not make sense is ignored.
- When the container is narrower than `stack-below`, the sides stack with no divider, so a phone
  (320 px upward) gets one column.

The shared list layout (`frontend/src/layouts/hass-tabs-subpage-data-table.ts`) uses the same idea
for its filter pane, which can be resized. The Ollama page also uses the split panes.

## Failure modes

- A corrupt or out-of-range stored size falls back to the default size.
- If browser storage is not available, the layout still works and simply forgets the size.

## How it was checked

`frontend/test/components/layout/split-panels-logic.test.ts` passes. The divider, the keyboard use
and the stacking on a phone were not seen in a browser.
