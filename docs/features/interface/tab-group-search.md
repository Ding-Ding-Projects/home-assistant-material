# Search for each tab group

The New tab catalog behind the plus button of the page tab bar lists every page in four groups: pinned tabs, pages, settings and tools. Each group has its own search field in its header. A group search filters only that group, so a short list of settings can be narrowed without hiding any page.

## What each group offers

| Group | Search | Count | Close matching |
| --- | --- | --- | --- |
| Pinned | Own field | Shown of total | Closes matching pinned tabs. Only this button closes pinned tabs, because pinned tabs are kept from closing by accident. |
| Pages | Own field | Shown of total | Closes matching open tabs that are not pinned. |
| Settings | Own field | Shown of total | None. Settings pages are not tabs. |
| Tools | Own field | Shown of total | None. Tools pages are not tabs. |

The search field at the top of the catalog still filters everything. A group shows the items that match both the top field and its own field.

## Search text

Plain text matches the title or address of a page, ignoring case. Text written as `/pattern/flags` is a regular expression, and each field has its own pattern workbench with its own pattern, flags and validation. Nothing is shared between the fields.

A pattern that cannot be used never hides anything: the group keeps showing all of its items and Close matching stays disabled with a note that the pattern cannot be used.

## Close matching and Undo

Close matching acts only on the tabs of its own group, and only on tabs that are open. The page you are on is never closed. Tabs of other groups, tab order, pins and the stored history of closed tabs are left alone. After a close the group shows how many tabs closed and an Undo button that reopens exactly those tabs. Opening the catalog again clears the group fields and the Undo note.

## On a phone

The group fields live in the same catalog sheet. On a narrow screen the search field in the bar becomes a button, and the catalog fills the width with one column and fields that are at least 44 px tall.

## Where it lives

- `frontend/src/common/tabs/tab-group-search.ts` holds the pure filtering and the close plan.
- `frontend/src/components/ha-page-tabs.ts` renders the fields.
- `frontend/test/common/tabs/tab-group-search.test.ts` covers filtering per group, unusable patterns, pinned tabs and empty results.

## Verification

The logic is covered by unit tests. The rendered catalog was not opened in a browser for this change.
