# Feature status

What exists today, stated plainly. "Designed" means a board exists in `design/` and nothing is built in the product yet. Nothing is marked done until it has been seen working in a built image.

## Product

| Feature | State | Where |
| --- | --- | --- |
| Upstream sources in one repository | Done | `UPSTREAM.md` |
| Release on every push with a unique tag | Done, build 1 verified through the container image | `.github/workflows/release.yml` |
| Container image for amd64 and arm64 | Done, publicly pullable | release notes |
| Core, machine, landing page and supervisor images | Done, built in build 1 | release notes |
| Update feed and updater pointed at this project | Done, feed live; an update between two builds is not yet observed | `docs/material-changes.md` |
| Operating system images: Raspberry Pi 3, 4, 5 and VirtualBox | Building; not yet booted on a device or in VirtualBox | release workflow |
| Operating system updates over the air | Wired; needs the two signing secrets | README |
| `build.sh`, `build.bat`, `build-installer.bat`, dependency installers | Written; not yet run end to end | repository root |
| Dedicated build application | Not started |  |
| Project website | Not started |  |

## Interface

| Feature | State | Where |
| --- | --- | --- |
| Material Design 3 shell: rail, pane, pill tabs, tokens | Partly built: colour scales, surfaces, typeface, navigation rail, floating pane, borderless cards and pill tabs are in the frontend and seen working in its demo build (`docs/screenshots/`). The tab bar of open pages is built (see the Tabs row). Not built: the search field and accessibility button in the header, the redesigned Home, the dark theme check, the phone layout. | Main, Energy, Settings, Phone, Tokens |
| Motion with a reduced-motion path | Designed | Settings, Accessibility |
| Live charts | Designed | Energy |
| First-run wizard | Designed | Onboarding |
| Language modes, playfulness sliders, dialog emoji switch | Designed | Language |
| Personal wording file and drop to apply | Designed | Vocabulary |
| Spoken narrator and action sounds | Designed | Narration |
| School mode and focus modes | Designed | Modes |
| Scheduled and external settings sources | Designed | Schedule |
| Renaming the app and logo customization | Designed | Identity |
| Dim sum surprise | Designed | DimSum |
| Per-element appearance editor | Designed | AppearanceType, AppearanceLayers |
| Colour picker and translator | Designed | ColorPicker |
| Fonts and type scale | Designed | Fonts |
| Accessibility tools | Designed | Accessibility |
| Resizable panels, collapsible filters and statistics | Designed | Panels |
| Tabs open by default and the New tab catalog | Built for pages on wide screens and seen working in the demo build (`docs/screenshots/tabs.png`): every page starts open in page order, a closed tab stays closed, a page added later opens by default, close buttons show on the active tab and on hover or focus, the New tab catalog lists every page with search, and Open every tab reopens them all. Arrow, Home and End keys move between tabs. Not built: the pattern workbench on the catalog search, tabs on a phone, drag to reorder, bulk close. | Tabs |
| Command palette on Ctrl+Shift+F | The existing quick bar is rebound to Ctrl+Shift+F. Not seen working: the demo build has no quick bar. The redesigned palette with live controls is not built. | CommandPalette |
| Pattern workbench on every search | Designed | Regex |
| Context menus with working shortcuts | Designed | ContextMenu |
| Guided forms and per-control information buttons | Designed | GuidedForm |
| Settings that explain themselves | Designed | Settings |
| Extension support | Designed | Extensions |
| Starting points for blank editors | Designed | BlankEditor |
| Two-key confirmation | Designed | SuperConfirm |
| Element locks | Designed | Locks |
| Unlock ladder | Designed | Ladder |
| Support Tickets | Designed | SupportTickets |
| Authenticator and QR pairing | Designed | Authenticator, QrPairing |
| Local version history | Designed | History |
| Export in every format | Designed | Export |
| Bulk actions | Designed | Bulk |
| Changelog viewer | Designed | Changelog |
| Offline help articles | Designed | Docs |
| Rendered provider text | Designed | ReleaseNotes |
| Notification centre and toasts | Designed | Notifications |
| File converter | Designed | Converter |
| Base64 toolkit | Designed | Base64 |
| Minecraft server manager and world generator | Designed | Minecraft, WorldGen |
| Local Ollama suite | Designed | Ollama |
| External editor hand-off and publishing to a forge | Designed | Handoff |
| Drawing and annotation | Designed | Drawing |
| Progress and recovery | Designed | Progress |
| Version and updated-at on the first screen | Built: version, date and time with seconds and time zone at the foot of the rail, from build-time constants. Seen in the demo build. | Main, About |
| Free, with nothing to buy | Designed | About |

## Not applicable to this product

| Feature | State | Where |
| --- | --- | --- |
| Windows virtual disk manager | Not applicable | A web application served from Linux has no Windows host to manage |
| Browser-extension download hand-off | Not applicable | No browser extension in this product |
| Job document wording | Not applicable | Applies to job-related products |
| Frameless desktop title bar | Not applicable | Runs in a browser or companion app |
