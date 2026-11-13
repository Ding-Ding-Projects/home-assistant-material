# Dashboard editor tools (second set)

New entries in the Dashboard tools dialog (`dashboard-tools-dialog/registry.ts`, `editor/tools/`),
added in batches 44 and 48 beside the tools in `dashboard-tools.md`. The dialog was restyled; it is
still a centred dialog, not a side panel or a sheet.

| Tool | What it does |
| --- | --- |
| Screens | Four same-origin frames of the saved view side by side |
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
