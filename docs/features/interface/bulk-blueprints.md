# Bulk actions on the Blueprints table

The Blueprints page (Settings, Automations and scenes, Blueprints) shows the
shared bulk bar when one or more rows are selected. It offers two actions.

## Delete

Delete shows a preview first, then asks a second time before it runs.

- A blueprint that automations or scripts still use is **skipped**. The backend
  refuses to delete such a blueprint, so the preview marks it with the number
  of automations and scripts that use it. The counts are the ones the page
  already reads for its "Used by" column.
- Just before the work starts the page reads the usage again, so a blueprint
  that became used in the meantime is never sent to the delete call. If that
  check fails for any blueprint, nothing is deleted and an alert explains why.
- Blueprints that cannot be loaded (shown with an error) can be deleted when
  nothing uses them.
- Deleted blueprints cannot be restored.

## Re-import

Re-import is offered for blueprints that have a source address.

- A blueprint with no source address is skipped, and the preview says so.
  A blueprint that could not be loaded is skipped as well.
- Each blueprint is fetched **only from the source address it already has**.
  Nothing is sent anywhere else, and the preview lists the address each
  blueprint will be fetched from before anything runs.
- The fetched copy replaces the saved one, as the single-row re-import does.

## Result

When the work ends, a short message says how many blueprints were deleted or
re-imported and how many were skipped. If any request failed, an alert names
the blueprints that failed. After a delete, the blueprints that were not deleted stay selected; a
re-import leaves the selection as it was.

## Where it lives

- `frontend/src/panels/config/blueprint/blueprint-bulk-actions.ts` holds the
  skip rules, previews and result summary, free of any element.
- `frontend/src/panels/config/blueprint/ha-blueprint-overview.ts` hosts the
  bar and runs the requests.
- Tests: `frontend/test/panels/config/blueprint/blueprint-bulk-actions.test.ts`
  cover in-use skipped, no-source skipped and mixed outcomes.

The actions are disabled while the usage counts are still loading.
