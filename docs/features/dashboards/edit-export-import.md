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

## What the import summary promises

The summary is the only thing read before an imported dashboard goes live, so it follows these
rules (`address-host.ts`, `dashboard-file.ts`):

- Every address is first read the way a browser reads it: leading and trailing control
  characters and spaces are dropped and tab, carriage return and line feed are deleted
  anywhere. It is then parsed with the browser's own URL parser against the page's origin, and
  only after that is it escaped for display. An address that held a control character is
  flagged, and so is one written without the usual two slashes (`https:evil.com`,
  `https:/evil.com`, `https:\\evil.com`, `/\evil.com`, `\\evil.com`).
- A relative address stays "on this site" only when it starts with a single slash and resolves
  to this origin. Anything else in a link action is listed as an outside address.
- A toggle is listed when it acts on a lock, cover, alarm panel, valve, siren, climate device,
  water heater or vacuum, whether the file names the entity or the card's entity is used. A
  button card with such an entity and no action of its own is listed too, because pressing it
  toggles the entity.
- An action is "plain" (no "Check" mark) only when it calls a plain light, fan or media player
  service on entities the file names outright, of that service's own domain, with no `all`,
  area, device, label, floor or template. Switch, cover, scene and input boolean services
  always need a look. "Plain" describes the call and is not a safety judgement.
- A record that names both `perform_action` and `service` lists both, and the riskier decides.
  The target and `data.entity_id` are both shown.

## Failure modes

A file that is not a dashboard file is refused with a message and nothing is made.

## Verification

On 10 November 2026, at phone width in a running build: the dashboards settings page and its
Add dialog, edit mode on a created dashboard, and "Edit cards and layout" on Overview making an
editable copy (confirmation, default-page question, the copy opening) were seen. Opening the
copy straight in edit mode, and the welcome banner covering the Overview header at phone width,
were broken, are fixed in source, and are not seen fixed (the banner fix was confirmed only by
applying the same rule inside the open page). Export, import and the summary have not been seen.
