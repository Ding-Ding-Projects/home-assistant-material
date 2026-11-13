# Navigation pane, tool pill and page title block

The shell follows the modern design boards: one floating side pane, the page in a second
rounded card, and one floating pill of page tools. Built in batches 41, 45, 46 and 47.

## What it does

- **Navigation pane (the default).** On a wide window the left pane is a floating card, 248 px
  wide (72 px collapsed). It holds the brand and instance name, a pill search field, the
  Pages group with a tonal pill on the open page, a New tab row, the System group with count
  badges, Developer tools, Settings, Notifications with a count, the person's name and role
  line, the Assist microphone, a tools menu and an Edit sidebar button. The old rail and the
  top tab strip are replaced by it unless a person chooses otherwise.
- **Floating tool pill.** One pill at the top of the page holds the page's first action, search,
  appearance, history, share, lock, a divider, help and, always last, the page's own menu
  (`frontend/src/layouts/tool-pill-order.ts`). "Search this page" is a magnifier that opens the
  field in a small card with Read aloud. On a dashboard, Add, Search and Assistant are in the
  three-dot menu.
- **One title block.** List pages show one breadcrumb, a large title and one summary line
  with the count (for example on Devices). Settings pages have larger titles.
- **Dashboard top.** On wide windows: breadcrumb, large title, the views as a segmented control,
  and edit mode on the same layout. The header scrolls with the page.
- **Home page.** The welcome banner is part of the page flow on wide windows so the greeting is
  never covered; a phone keeps the fixed banner.

## Where to find it and how to change it

Settings, Personal settings. The switch is "One navigation pane". The edge the pane sits on is
stored under the key `pageTabsEdge`. Nothing writes the edge by itself any more, so every
browser starts with the left side pane; an edge chosen earlier (right, bottom, floating, top)
has to be chosen once more, and a later choice is kept and synced. Earlier builds stored "top"
for installations that never chose it, which is why a stored "top" is no longer read as a
choice.

## Limits and failure modes

- With the pane on, sidebar edit mode, per-page hiding, the update badge on Settings and the
  Assist entry are out of view in the narrow cases described in `HANDOFF.md`.
- Not built: a large title and breadcrumb on dashboards beyond the segmented views row, a
  tertiary button tone, the inverted action bar, the keyboard hint on Save, an illustrated
  empty state, card shadow on phone rows.
- Seen wrong in published build 371 and still open: "Notifications" in the pane sits off
  centre, and the welcome banner is cut at the top edge on a wide home page.

## Privacy and accessibility

Nothing is sent anywhere; the choices are interface settings. The pane and pill use the same
keyboard operation and focus ring as the rest of the interface, honour the reduced-motion
setting, and are drawn right to left where the language needs it.

## How it was verified

Unit tested in every batch. Published build 371 was viewed in a headless browser (80 pictures,
24 pages, light and dark, wide and phone, no sideways overflow). Seen right there: the pane's
role line and tools menu, the page menu last in the tool pill, one title block with a summary on
Devices. Not yet seen: the toggle off, top, bottom, right and floating docks, collapsed pane,
right to left, both-languages mode. State: built; the listed parts seen in published build 371.
