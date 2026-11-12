# Search for each tab group

The New tab catalog behind the plus button of the page tab bar lists every page in four groups: pinned tabs, pages, settings and tools. Each group has its own search field in its header. A group search filters only that group, so a short list of settings can be narrowed without hiding any page.

## What each group offers

| Group | Search | Count | Close matching |
| --- | --- | --- | --- |
| Pinned | Own field | Shown of total | Closes matching pinned tabs. Only this button closes pinned tabs, because pinned tabs are kept from closing by accident. |
| Pages | Own field | Shown of total | Closes matching open tabs that are not pinned. |
| Settings | Own field | Shown of total | None. Choosing a settings page opens it as its own tab (see Settings pages and tools as tabs below). |
| Tools | Own field | Shown of total | None. Choosing a tool opens it as its own tab. |

The search field at the top of the catalog still filters everything. A group shows the items that match both the top field and its own field.

## Search text

Plain text matches the title or address of a page, ignoring case. Text written as `/pattern/flags` is a regular expression, and each field has its own pattern workbench with its own pattern, flags and validation. Nothing is shared between the fields.

A pattern that cannot be used never hides anything: the group keeps showing all of its items and Close matching stays disabled with a note that the pattern cannot be used.

## Close matching and Undo

Close matching acts only on the tabs of its own group, and only on tabs that are open. The page you are on is never closed. Tabs of other groups, tab order, pins and the stored history of closed tabs are left alone. After a close the group shows how many tabs closed and an Undo button that reopens exactly those tabs. Opening the catalog again clears the group fields and the Undo note.

## Settings pages and tools as tabs

A destination tab is a settings page (for example Automations and scenes, or System, Updates) or a tool (for example the file converter or YAML tools) that has its own tab in the strip, with its own icon and title. It is made only by choosing the page in the catalog; visiting it from a menu or the navigation rail never adds a tab, and Open every tab never opens a destination the person did not choose.

- **One tab per destination.** Choosing a destination that already has an open tab focuses that tab. A closed one is opened again; one never opened is added after the other tabs. Each entry in the catalog says which of the three it is: open as a tab, closed by you, or open as a new tab.
- **Which tab is selected.** A destination tab is selected while its address, or any address below it, is shown. The most specific open tab wins. When no destination tab claims the address, the Settings page tab stays the selected tab for every other settings route. The selection follows navigation inside a page, not only changes of page.
- **Same options as any tab.** A destination tab can be pinned, grouped, reordered, locked, given its own look, found by the searches, closed, and docked to any edge like a page tab. Closing the destination tab that is in use goes to the neighbouring tab (the next one, or the previous one when it was last). A pinned or locked destination tab is protected from bulk close as any other tab.
- **Saved and synced.** The destinations that were opened are saved per strip under `pageTabsDestinations` (settings and tools only, at most 100, validated and bounded like the other tab lists), carried by the instance settings sync and listed in the local change history as Settings and tools tabs. Which of them are closed, and their order, pins, groups, looks and locks, live in the same keys as every other tab. A reload brings them back; the titles are loaded again first, because settings titles are loaded on demand.
- **Visibility.** The catalog offers only the destinations the person may see: it uses the same checks as the catalog rows (administrator pages for an administrator, tools whose integration is loaded), and also requires that the panel serving the address exists for the account, because an account without the settings panel is sent to its default page instead. An open tab whose destination is not offered is hidden, not deleted, and comes back when the destination is offered again.

Limits: the list holds at most 100 destinations per strip and refuses more; a settings page and a tool at the same address share one tab; the phone Pages sheet reads the strip's saved lists but does not yet list or open destination tabs; the strip itself has no entry for a destination that is not in the catalog (for example a page inside a dashboard).

## On a phone

The group fields live in the same catalog sheet. On a narrow screen the search field in the bar becomes a button, and the catalog fills the width with one column and fields that are at least 44 px tall.

## Where it lives

- `frontend/src/common/tabs/tab-group-search.ts` holds the pure filtering and the close plan.
- `frontend/src/components/ha-page-tabs.ts` renders the fields.
- `frontend/src/common/tabs/tab-destinations.ts` (identity, address, selection and neighbour rules) and `tab-destination-list.ts` (the saved list) hold the destination model; `frontend/src/components/tabs/destination-tabs.ts` resolves titles and icons and handles choosing one.
- `frontend/test/common/tabs/tab-destinations.test.ts`, `tab-destination-list.test.ts` and `frontend/test/components/tabs/destination-tabs.test.ts` cover selection, no duplicates, closing and reopening, hiding, validation and bounds.
- `frontend/test/common/tabs/tab-group-search.test.ts` covers filtering per group, unusable patterns, pinned tabs and empty results.

## Verification

The logic is covered by unit tests. The rendered catalog was not opened in a browser for this change.
