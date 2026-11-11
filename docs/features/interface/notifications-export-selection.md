# Notifications, export and the selection bar

Code: `frontend/src/panels/config/notifications/`, `frontend/src/common/page/export-page.ts`,
`frontend/src/layouts/hass-tabs-subpage-data-table.ts`.

## Notifications

Settings, Notifications lists every notification the instance holds, newest first, with a search
(and the pattern workbench), a selection mode and dismiss for one or all. Dismissed
notifications are kept in this browser for 30 days and every dismissal can be undone. Rows are
neutral because the instance sends no severity, and none is guessed from the words. A failed
dismissal is reported and never hidden. Outside links show their host. Not built: colours by
severity, action buttons and stacked toasts.

## Export

The Export tool makes a file from what the page shows: CSV (formula cells disarmed without
turning numbers into text), JSON, Markdown, plain text, HTML, and a tab-separated format.
Duplicate column names are kept apart, a note says when rows were cut, and "selected rows only"
exports just the ticked rows. Not built: spreadsheet and PDF files.

## Selection bar

A bar at the bottom of a list shows what will change before a destructive action. It counts
only the rows shown and says when ticked rows are hidden by the filter. It is used on
Notifications, Labels, Automations and Scripts; Helpers shows the bar without actions. A review
finding about the header checkbox on tables that have their own bulk bars is open
(`../../HANDOFF.md`).

## Verification

The Notifications page and CSV export were seen earlier (`../../screenshots/notifications-page.png`,
`page-tools-export.png`). Everything added since is checked by lint, the type check and unit tests
only and has not been seen in a running build.
