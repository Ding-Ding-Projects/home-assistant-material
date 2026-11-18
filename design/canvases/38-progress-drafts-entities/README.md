# Canvas 38: progress, drafts and every entity kind

Six boards, each drawn as real screens of the app in its dark theme at phone width (390 px). They are the reference for the detailed update and backup progress, the autosaved drafts with import and export, and the check of every entity kind.

| Board | Page | What it shows |
| --- | --- | --- |
| `Main.dc.html` | Updates | Interactive. Compact update rows (64 px resting, the rest behind a chevron), the "Update coming soon" card closed and open, an update installing with its stages, times and live output, a waiting row that says why it waits, a device that reports no percentage, and the finished and failed results |
| `Backups.dc.html` | Backups | A backup running with every stage on its own row and every upload place with its own bytes, speed and estimate; the finished backup with the check of each copy in plain words; the setting for checking copies in other places; compact place cards |
| `Drafts.dc.html` | Drafts, import, export | Interactive. Coming back to unsaved changes after a crash, the editor menu as a bottom sheet with draft history, download, copy and import, and an import preview that marks what this home does not have |
| `Entities.dc.html` | Every entity kind | Interactive. The list row, the detail sheet (light, climate, cover and lock shown) and the tile for an entity, plus the first control for each of twenty-four groups of entity kinds |
| `Before.dc.html` | Backup before an update | Interactive. One choice for which updates get a backup first: system updates only (Core, Supervisor, operating system), every update, or none; what that means kind by kind; and how the update rows show it |
| `Camera.dc.html` | Camera sheet | A camera's detail sheet live, limited by its provider for too many requests, starting, and offline. The message sits inside the picture area and never covers the header |

## Rules the boards carry

- A progress bar moves only when the source reports movement. No percentage reported means an indeterminate bar that says so.
- An estimate appears only after real samples and is labelled as an estimate. A duration is shown only when the start was really recorded.
- Each upload place has its own row, so one slow or failed place is visible.
- A draft never runs. The live item changes only on Save. The draft status is a quiet line of text.
- Importing opens items unsaved and turned off, and replaces nothing until Save.
- Every entity kind has a 56 px row, a detail sheet whose first control is the thing people do most with that kind, and a tile.
- Largest type on these phone screens is 28 px; rows are 52 to 64 px; touch targets are at least 44 px.

## Status

Design references. These boards were drawn after the first build of the update progress, backup progress and drafts, to record the intended design and to guide the repairs and the entity check; where the build and a board differ, the board is the target. The boards were made without filming or rendering frames; they are reviewed by using them on the canvas.
