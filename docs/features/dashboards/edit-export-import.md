# Editing built-in dashboards, export and import

Code: `frontend/src/panels/lovelace/import-export/` (`can-edit-copy.ts`, `dashboard-actions.ts`,
`dashboard-file.ts`, `dashboard-file-import.ts`, `dialog-import-summary.ts`),
`frontend/src/panels/config/dashboard/`, `frontend/src/panels/maintenance/`.

## What it does

- Built-in pages such as Overview have "Edit cards and layout". It asks for confirmation, asks
  whether the copy should become the default page, makes an editable copy and opens it in the
  editor. On a phone the edit button sits beside the menu.
- A dashboard can be exported to a file. A dashboard file dropped anywhere on the window is
  imported as a new dashboard, with Undo. Before anything is made, a summary shows the outside
  addresses, the custom cards and the buttons that would call a service. Imports start hidden
  from the rail and visible to administrators only.

## Failure modes

A file that is not a dashboard file is refused with a message and nothing is made.

## Verification

On 10 November 2026, at phone width in a running build: the dashboards settings page and its
Add dialog, edit mode on a created dashboard, and "Edit cards and layout" on Overview making an
editable copy (confirmation, default-page question, the copy opening) were seen. Opening the
copy straight in edit mode, and the welcome banner covering the Overview header at phone width,
were broken, are fixed in source, and are not seen fixed (the banner fix was confirmed only by
applying the same rule inside the open page). Export, import and the summary have not been seen.
