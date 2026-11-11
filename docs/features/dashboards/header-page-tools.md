# Page tools in the dashboard header

Every page header has a cluster of page tools: search this page, edit
appearance, read aloud, history, export, lock and help. Dashboards used to
have only a footer and the right-click menu. The dashboard toolbar now carries
the same cluster.

## Which tools show

The decision lives in `frontend/src/panels/lovelace/dashboard-page-tools.ts`.

| Dashboard mode | Tools shown |
| --- | --- |
| View | All seven tools, using the shared `ha-page-tools` cluster |
| Edit | Edit appearance, history, export and help (lock and read aloud are hidden) |
| Locked | Unlock only |

## Phones

On a narrow screen the cluster collapses into one overflow button that opens
the tools panel, so the title and view tabs stay readable at 320 px. Every
button is at least 44 px square.

## Behaviour that is unchanged

All existing toolbar items and keyboard shortcuts keep working. The cluster
sits outside the inert action items, so Unlock stays usable on a locked
dashboard. Embedded dashboards show no cluster, as they show no action items.
The footer, the dashboard tools dialog and history pages are not changed.

## Limits

- The shared cluster always shows every tool. For edit and locked modes the
  header therefore draws its own buttons, which fire the same events
  (`hass-pick-appearance`, `hass-page-tool`) as the shared cluster.
- Search this page is part of the shared cluster only, so it is not shown in
  edit mode. Showing it there needs a hide option on the shared component.
- Nothing here sends data outside the instance.

## Verification

Unit tests in `frontend/test/panels/lovelace/dashboard-page-tools.test.ts`
cover the mode decision, the tool lists and the phone overflow. The header
itself has not been checked in a browser.
