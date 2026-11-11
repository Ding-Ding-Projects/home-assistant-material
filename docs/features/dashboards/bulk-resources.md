# Bulk delete on the Resources list

The Resources list (Settings, Dashboards, Resources) lets you tick several
resources and delete them in one go. The same selection bar is used on the
Helpers and Labels lists.

## How it works

1. Tick rows. A bar appears at the bottom with how many are selected, and
   buttons to select everything the list shows, invert the selection, or clear
   it.
2. Press **Delete**. A preview opens that names every resource that will be
   deleted. A local resource shows its address, for example `/local/card.js`.
   A resource loaded from another host shows only that host and is marked as an
   outside address.
3. Press **Delete** in the preview, then press the button again to confirm.
   Nothing is deleted before the second press.
4. After the work finishes you are asked to refresh the page, as with a single
   delete.

Selected resources that the search or filter currently hides are included in
the delete. The bar and the preview both say how many are hidden.

## Dashboards that load a resource

Deleting a resource that a dashboard still loads breaks that dashboard. The
preview is built to list one warning line per resource that a dashboard
references. The Resources page does not load dashboard configurations, so it
cannot read that today. The preview therefore says plainly that this page
cannot tell whether dashboards still load these resources, instead of guessing.
The warning lines appear as soon as the page is given the dashboards that load
each resource.

## Failures

Each resource is deleted on its own request. If some fail, the ones that were
deleted leave the list, the ones that failed stay in the list and stay
selected, and a message names them so you can retry.

## Limits

- Resources in YAML mode cannot be changed from the interface, so rows cannot
  be selected there.
- Deleting cannot be undone from the page. Add the resource again to restore
  it.

## Verification

The rules (outside address detection, preview lines, hidden selection and
partial failure) live in
`frontend/src/panels/config/lovelace/resources/resource-bulk-actions.ts` and are
covered by `frontend/test/panels/config/lovelace/resource-bulk-actions.test.ts`.
The page itself has not been checked in a browser.
