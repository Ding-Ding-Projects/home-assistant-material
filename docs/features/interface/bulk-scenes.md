# Bulk actions on scenes

The Scenes page lets you act on several scenes at once. Turn on selection with
the Select scenes button, tick the scenes, and the shared bulk bar appears at the
bottom of the page.

## What the bar offers

| Action | What it does | Preview first |
| --- | --- | --- |
| Move to category | Sets one category on every selected scene, or clears it. | No |
| Add label | Adds a label to every selected scene. Lists the labels not yet on all of them. | No |
| Remove label | Removes a label from every selected scene. Lists the labels at least one carries. | No |
| Move to area | Sets the area of every selected scene (existing behavior). | No |
| Apply | Activates every selected scene. | Yes |
| Delete | Deletes every selected scene. | Yes, then a second confirmation |

The bar also shows how many scenes are selected, offers Select all, Invert and
Clear, and says how many selected scenes the current search or filters hide.
Hidden scenes stay selected and are included in an action; the preview lists
them.

## Preview and skipped scenes

Apply and Delete show a preview with one line per selected scene. Scenes the
action cannot handle are listed with the reason instead of being dropped:

- Delete skips scenes defined in YAML, which cannot be deleted from the
  interface.
- Apply skips scenes that are unavailable.
- A selected scene that no longer exists is reported as not found.

The Apply preview states that applying a scene changes the state of real
devices right away and cannot be undone. The confirm button is disabled when
every selected scene is skipped. Delete asks twice: the first press arms the
button, the second runs it.

## Failures

Every call runs per scene. If some fail, one dialog lists each failed scene by
name with the reason, and those scenes stay selected so you can try again.
Scenes that worked leave the selection after Apply and Delete. Label, category
and area changes keep the selection so you can chain them.

## Where it lives

- `frontend/src/panels/config/scene/scene-bulk-actions.ts`: the planning,
  preview and result logic, free of any element.
- `frontend/src/panels/config/scene/ha-scene-dashboard.ts`: the page wiring,
  using `ha-bulk-bar` as the automations list does.
- `frontend/test/panels/config/scene/scene-bulk-actions.test.ts`: YAML scenes
  skipped, hidden selection count and partial failure.

Nothing here was checked in a browser. The logic is covered by the unit tests
above; the page wiring still needs a visual check on a phone and on a wide
screen.
