# Bulk actions on the Dashboards list

Code: `frontend/src/panels/config/lovelace/dashboards/ha-config-lovelace-dashboards.ts` (the page),
`dashboard-bulk-actions.ts` (the rules), and the shared bar in `frontend/src/components/bulk/`.
Tests: `frontend/test/panels/config/lovelace/dashboard-bulk-actions.test.ts`.

## What it does

Ticking rows on Settings, Dashboards shows the same selection bar as the helpers list. It sits above
the bottom navigation on a phone, and every button in it is at least 44 px high. The bar offers:

- **Show in sidebar** and **Hide from sidebar**, using the existing dashboard update call.
- **Delete**, which is destructive.

Each action first opens a preview that names every dashboard and what will happen to it. Delete asks
twice: press Delete, read the list, press the confirm button, then press it again when it says
"Yes, ...". Nothing runs before the last press.

## What is skipped, and why

Rows that cannot be changed are never an error. They are listed in the preview as skipped, with the
reason, and the rest still run:

- the default dashboard (it cannot be hidden or deleted),
- built-in pages such as Overview pages, which the dashboard update and delete calls do not manage,
- dashboards set up in YAML, which are read only.

For show and hide, a dashboard already in the wanted state is listed as "already" and not touched.
The confirm button counts only the dashboards that will really change, and is disabled when there are
none.

## What the count covers

An action covers only the rows the table shows. A ticked row that the search or a filter hides stays
ticked, the bar says how many are hidden, the preview repeats it, and the action leaves those rows
alone. "Select all" and "Invert" also touch only the rows shown.

## History

Deleting a dashboard keeps its archived history exactly as the dashboard history feature already
does: the instance moves the dashboard's repository aside instead of erasing it (see
`docs/features/dashboard-history/README.md`). The preview says so when the history feature is on.

## Failure modes

Requests run side by side and one failure never stops the others. Afterwards a message names each
dashboard that could not be changed, with the reason the instance gave. The rows that worked are
updated or removed in the list.

## Verification

The rules (mixed selection, all skipped, one failure among many, a filter hiding ticked rows) are
unit tested. The page wiring was not seen in a browser.
