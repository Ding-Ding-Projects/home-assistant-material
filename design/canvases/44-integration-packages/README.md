# Integration packages: Marketplace boards

Design boards for installing `.hapkg` packages in the Marketplace and for their automatic updates.

| Board | Size | What it shows |
| --- | --- | --- |
| `PackageDrop.dc.html` | 390 x 844, interactive | Marketplace page on a phone: drop overlay, the found dialog (title, version, source, checksums verified, two-step confirm) and the wrong-file error. Tweaks: `accent`, `motion`, `stage` (idle, dragging, found, wrong-file). |
| `PackageDropWide.dc.html` | 1280 wide page | The same flow on a desktop. Same Tweaks. |
| `PackageUpdates.dc.html` | 390 x 844, interactive | Packages installed from a file, each with version, source and an "Update automatically" switch, in the states up to date, update available, updating, restart needed and update failed. Tweaks: `accent`, `motion`. |

The boards come from the shared "Integration packages" design canvas, which also holds the website and per-integration boards (those are kept in Ding-Ding-Projects/home-assistant-integrations under `design/canvases/integration-packages/`). The boards reference `support.js`, which belongs to the canvas and is not copied here.

State: design only. The implementation in `frontend/src/panels/marketplace` was written from the same description and has not yet been compared with these boards in a browser.
