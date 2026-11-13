# Dashboard editor tools (second set)

New entries in the Dashboard tools dialog (`dashboard-tools-dialog/registry.ts`, `editor/tools/`),
added in batches 44 and 48 beside the tools in `dashboard-tools.md`. The dialog was restyled; it is
still a centred dialog, not a side panel or a sheet.

| Tool | What it does |
| --- | --- |
| Screens | Select phone, tablet, wall panel, and desktop frames of the saved view; rotate each independently and add a custom 240–3840 pixel viewport |
| Layout and resize | Grid columns and rows per card in sections views; drag to resize; "Make phone friendly" |
| Visibility | The existing visibility editor per card |
| Interactions | Tap, hold and double-tap actions, and tap feedback |
| Style | Properties cards really read, copy and paste of them, a theme per view; card styling is in `popups-styling-and-history-compare.md` |
| State simulator | Works on a copy of the states, in inert previews |
| Entity inspector | Shows an entity's use and swaps it |
| Accessibility scan | Contrast, target size and missing names; "not judged" where it cannot tell; no Fix button |
| Wall panel | Clock screensaver, view rotation, night dimming; per browser, off by default; started from `ha-panel-lovelace.ts` |
| Card library | Versions kept in frontend user data (`dashboard_card_library`); card files; a Cameras section; an energy Cost tile |
| Performance | Redraw time per card and first-draw time |
| Checkpoints and diff | Named checkpoints and a structural diff between them |

## Limits and failure modes

- Not built: free pixel layout, per-gesture animation, radius and shadow overrides beyond the
  Style tab, share as an extension, subscription counts.
- The state simulator never calls a service. The accessibility scan reports only what it can
  measure.
- The wall panel is per browser and off by default; it never changes the saved dashboard.
- Card files and the library hold card configuration only. Nothing leaves the device.

## How it was verified

Unit tested (editing functions, scans, library versions). Not seen in a browser. State: built,
unit tested, not yet seen in a running build.

## Screen comparison controls

Choose only the device frames needed for the current comparison to avoid loading unused dashboards. Each frame has a Rotate action. Enter both custom dimensions to add a bounded custom viewport; invalid dimensions do not load a frame. These controls do not modify dashboard configuration. Frames still show the saved view, not unsaved editor changes.

Dimension validation and rotation are covered by focused unit tests. Browser verification remains required.

## Local saved revision journal

Successful saves through the dashboard panel now retain before/after raw configurations in a separate browser-local journal. It is scoped to the signed-in user and dashboard URL, limited to 20 save records and 1 MiB of serialized data per scope, and preserves strategy and unknown custom-card fields. It does not replace or migrate named checkpoints.

In **Checkpoints and diff**, use **Download saved revisions** to export the retained records for manual recovery. Nothing is restored automatically. This is not unsaved-draft recovery or cross-device version history, and does not capture changes made outside this panel's save path. Clearing browser data removes it; concurrent tabs can race, and oversized configurations or exhausted storage may not be retained. Journaling failures never roll back or fail an otherwise successful server save.

Unit coverage verifies successful-save timing, failure isolation, captured identity/configuration, raw-field preservation, account/dashboard isolation, corruption handling, and count/size limits. Browser verification remains required.


## Guarded revision restore

The saved-revision section now lets you select a before/after configuration, fetch and review the current server configuration, and explicitly confirm a whole-dashboard restore. The frontend sends the reviewed configuration as `expected_config`; it never falls back to an unguarded retry. A stale review or unsupported server rejects the operation. A failed response is treated as unconfirmed, so review the server again before retrying.

The fork's Lovelace storage implementation serializes reads, saves, guarded comparison/save, and deletion using a per-dashboard lock. Normal save callers keep their existing API. The guard prevents two concurrent restores from accepting the same outdated base in memory; it is not a disk-durability guarantee because the underlying Store can log write errors internally. Unsaved card drafts, remote revision history, and automatic merging remain out of scope.

Frontend contract and journal tests pass. Core API/concurrency/failure regression tests are added but require the Core test environment to run. A focused smoke check of the production storage methods passed concurrency, raised-storage-error, and legacy-save cases; it does not replace the Core integration tests.
