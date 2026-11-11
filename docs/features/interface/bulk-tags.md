# Bulk delete on the Tags table

The Tags page (Settings, Connectivity, Tags) uses the shared selection bar that
Helpers, Labels, Notifications, Automations and Scripts already use.

## What you can do

Tick one or more tags and a bar appears at the bottom of the page.

- Select all rows on this page, or all matches of the current search.
- Invert the selection of the rows shown.
- Clear the selection.
- Delete the selected tags.

The count in the bar covers the selection as a whole. Selected tags that the
search hides stay selected and are counted in a notice, so nothing is deleted
without being named.

## Deleting

Press Delete in the bar to open a preview. It lists:

- which tags will be removed (the first few names),
- how many selected tags are hidden by the search,
- any selected tag that an automation still triggers on, with the automation
  names. This is a warning only. The tag can still be deleted.

The destructive button asks a second time ("Yes, Delete") before anything is
removed. Deleting a tag is permanent and there is no Undo.

The automations that use a tag are read from the automation configurations the
first time a tag is selected. If some could not be read, the preview says so
rather than claiming no automation uses the tag.

## Failures

Each tag is deleted on its own. A tag that fails stays selected, and an alert
names the tags that could not be deleted. Tags that were deleted leave the
table.

## Code

- `frontend/src/panels/config/tags/ha-config-tags.ts` wires the table and bar.
- `frontend/src/panels/config/tags/tag-bulk-actions.ts` holds the pure logic:
  reading tag triggers, building the preview, splitting the selection and
  summarising partial failure.
- `frontend/test/panels/config/tags/tag-bulk-actions.test.ts` covers the preview,
  hidden selection, partial failure and an empty selection.

## Not covered

The bar offers only delete here. A table with other bulk actions, such as
moving tags, would need new bar actions.
