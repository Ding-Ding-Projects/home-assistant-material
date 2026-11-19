# Canvas 38: progress, drafts and every entity kind

Six boards, each drawn as real screens of the app in its dark theme at phone width (390 px). They are the reference for the detailed update and backup progress, the autosaved drafts with import and export, and the check of every entity kind.

| Board | Page | What it shows |
| --- | --- | --- |
| `Main.dc.html` | Updates | Interactive. Compact update rows (64 px resting, the rest behind a chevron), the "Update coming soon" card closed and open, an update installing with its stages, times and live output, a waiting row that says why it waits, a device that reports no percentage, and the finished and failed results |
| `Backups.dc.html` | Backups | A backup running with every stage on its own row and every upload place with its own bytes, speed and estimate; the finished backup with the check of each copy in plain words; the setting for checking copies in other places; compact place cards |
| `Drafts.dc.html` | Drafts, import, export | Interactive. Coming back to unsaved changes after a crash, the editor menu as a bottom sheet with draft history, download, copy and import, and an import preview that marks what this home does not have |
| `Entities.dc.html` | Every entity kind | Interactive. The list row, the detail sheet (light, climate, cover and lock shown) and the tile for an entity, plus the first control for each of twenty-four groups of entity kinds |
| `Before.dc.html` | Backup before an update | Interactive. One choice for which updates get a backup first: system updates only (Core, Supervisor, operating system), every update, or none; what that means kind by kind; how the update rows show it; and a custom mode that chooses which apps get a backup of their own when they update |
| `Camera.dc.html` | Camera sheet | A camera's detail sheet live, limited by its provider for too many requests, starting, and offline. The message sits inside the picture area and never covers the header. Also the recording amount for a camera: All day (the default), Light (video kept only around something being seen) or Off |
| `Events.dc.html` | Camera events and clips | The event list under a camera: a row offers Play only when a clip is really saved, shows progress while one is being saved, and says in one line why a clip is missing. A camera that streams only through its service is recorded around each event by the home itself, and the page says that All day is not offered for it |
| `Both.dc.html` | Both languages | The "both languages" mode at phone width: inside a button, tab or chip the two languages stack (English, then Cantonese smaller beneath) on one row; in running text a state or label is "English · Cantonese" on one line with an ellipsis; tiles, badges and list rows keep the same height in all three modes |
| `Check.dc.html` | Recording check, update order | A camera's "Recording check" on the camera recording page (each fact in one row with its time, a problem in one plain line, a 10 second test clip), and the Updates page when the Supervisor must go first, after a build is installed, and on a page opened in the middle of an update |
| `Cloud.dc.html` | Cloud drives, linked media | Where camera recordings go, with a cloud drive (through its own integration, which keeps the sign-in) as a place beside this system: what is sent, the folder, how long it is kept there, what is waiting. And media that lives at a web address: added by the owner, fetched only when something needs it, used like any media file, and thrown away after |
| `Watched.dc.html` | Keep what is watched | Live video starts by itself whenever a camera is on screen, and every live view and every snapshot is kept, whoever or whatever asked for it: the picture says it is being kept, the list and timeline show live views and snapshots beside events, one live view from the camera service is shared for watching and keeping, repeating dashboard snapshots are kept once a minute at most, and a wait imposed by the service is shown and ends by itself |
| `Registry.dc.html` | Container registry, encrypted | A free public container image registry as a place for camera recordings and for backups: a guided sign-in with an access token, a required password typed twice that locks everything at home before it is sent (it cannot be skipped or turned off, must be long, and is never stored or sent), one repository by default with any camera or backups able to have its own, older recordings played straight from the registry in parts, and the plain words about what public means |
| `Logs.dc.html` | Problem log to a repository | The problem log sent to a private repository so a helper can read what went wrong without a way into the home: a guided sign-in with a code approved on the host's own page (a token as the fallback), private repositories only and checked before every send, secrets and private details hidden first with a preview of the exact text, any problem can be held back, at most one send an hour by hand or by itself, and it only ever sends |

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
