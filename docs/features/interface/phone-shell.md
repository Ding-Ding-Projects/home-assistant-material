# Phone shell

How the interface is drawn on a phone (320 px upward). Built in batches 45, 48 and 49.

## What it does

- **Floating bottom bar.** A pill with Home, Search, Pages, Settings and Menu, and a tonal
  pill on the active item. Settings carries the count of updates plus repairs. The accessibility
  tools are the first row of the Menu drawer. The extra menu button at the top of pages is
  hidden on a phone.
- **Pages as cards.** The Pages sheet is one rounded card of rows, with quick tools in it and
  pages shown as a card grid. Rows of tables are drawn as cards, with round select marks.
- **Selection bar.** On a phone the selection bar is a light sheet above the phone bar.
- **Tools fold into More.** On pages without a menu of their own the page tools fold into one
  "More" sheet. A locked page keeps a visible lock icon.
- **Sheets.** The tool panel and the pattern workbench open as bottom sheets, and an element
  can be picked for appearance by touch.
- **Discovery.** The three discovery browsers share one tab strip and `/config/discovery`
  leads to the first of them.
- **Dashboards and lists.** Larger titles; page tools and edit are in the three-dot menu on
  dashboards; a magnifier replaces the grid elsewhere.

## Limits and failure modes

- Not built: the grid and edit icons at the top of phone pages, the greeting as the title,
  a folding tool pill (the More sheet covers pages without a menu), and the three discovery
  browsers as one page (they are still three addresses).
- The bar height published to pages is a fixed 64 px in the main layout.
- The upload picker on a real iPhone has not been confirmed.

## How it was verified

Seen in published build 371 and the build 137 pass in a headless browser: the floating phone bar,
card rows with round select marks, the phone Pages sheet in the wide strip's order, bar labels
on two lines at 320 px in both-languages mode, and the list footer clearing the floating button
at 390 px. The More sheet, quick tools, touch picking and bottom sheets are built and unit tested,
not yet seen. State: partly seen.
