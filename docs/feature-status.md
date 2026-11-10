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

## Checked in published images

Published images have been pulled from the registry and run, not only built:

| Build | What was checked in the running image |
| --- | --- |
| `2026.11.1.26` | Starts, first-run setup completes, the interface loads; the pattern workbench on the Entities table; `host.sh` end to end |
| `2026.11.1.29` | The version shown is 29; the menu on an element and the appearance tools; the private vocabulary card |
| `2026.11.1.32` | The automation repositories integration is built in and answers (no custom integration); the release has the VirtualBox image and the Raspberry Pi 3, 4 and 5 images |

The history manager page was checked with the frontend served from this repository on the
build 32 image.

## Interface

| Feature | State | Where |
| --- | --- | --- |
| Material Design 3 shell: rail, pane, pill tabs, tokens | Partly built: colour scales, surfaces, typeface, navigation rail, floating pane, borderless cards and pill tabs are in the frontend and seen working in its demo build (`docs/screenshots/`). The tab bar of open pages, its search button and the accessibility button are built (see the Tabs and Accessibility rows). Not built: the redesigned Home, the dark theme check, the phone layout. | Main, Energy, Settings, Phone, Tokens |
| Motion with a reduced-motion path | Designed | Settings, Accessibility |
| Live charts | Designed | Energy |
| First-run wizard | Designed | Onboarding |
| Language modes, playfulness sliders, dialog emoji switch | Designed | Language |
| Private vocabulary file and drop to apply | Built and seen working in a running instance. A card on Profile, Localization chooses, replaces or clears a JSON file (schema version 1, up to 256 KiB, UTF-8); a file can also be dropped anywhere in the window. The file is checked in full first: size, encoding, nesting depth, duplicate keys, unsafe keys, unknown fields, version, key and value lengths, control characters. A file that fails changes nothing and the message names the kind of problem without repeating anything from the file. Wording is applied where text is localized, so addresses, paths, identifiers and stored names stay literal. Only the checked entries are cached in the browser; nothing about the file is kept and nothing is sent anywhere. A short confirmation shows after a load. Checked by 31 unit tests. Seen in the running instance: an invalid file refused, a 324-entry file loaded, labels on Settings changed, the wording still in place after a reload. Not built: an entry in the command search, the Cantonese copy, School mode. | Vocabulary |
| Spoken narrator and action sounds | Designed | Narration |
| School mode and focus modes | Designed | Modes |
| Scheduled and external settings sources | Designed | Schedule |
| Renaming the app and logo customization | Designed | Identity |
| Dim sum surprise | Designed | DimSum |
| Per-element appearance editor | Built and seen working in a running instance (`docs/screenshots/appearance-editor.png`, `appearance-pick.png`). Any element can be picked three ways: the menu on right-click, Ctrl+Shift+E on the focused element, or the pick tool behind the paint button in the top bar. The editor opens beside the element with: which part (the element or what contains it), apply to this one or to every element of the same kind, fill layers (colour, gradient, picture; reorder, hide, opacity, blend), text colour, typeface and weight, corners, border, shadow, accent colour, size and opacity, and a text contrast reading. Changes apply as they are made, are saved in the browser, survive a reload, and have Undo, Reset this and Reset everything. Stored choices are validated: only named styles, hex colours, and picture addresses that cannot run script. Checked by 16 unit tests. Seen in the running instance: a gradient, text colour and corner radius on one dashboard card, still there after a reload; corners for every card of a kind; the pick tool. **Not seen**: inside a modal dialog, on a phone, with the keyboard only. Not built: masks, per-state layers (hover, focus, pressed), levels and filters on pictures, export and import of choices, sync between browsers. | AppearanceType, AppearanceLayers |
| Colour picker and translator | Designed | ColorPicker |
| Fonts and type scale | Designed | Fonts |
| Accessibility tools | Built on wide screens and seen working in the demo build (`docs/screenshots/accessibility.png`, `contrast.png`): a top bar button and Alt+A open the panel; text size from 100% to 200%, three contrast levels for light and dark, reduce motion, a focus ring that follows the focused control, larger targets, keyboard help, reset, and hiding the button with a confirmation. Choices are kept in the browser. Limits: text size and larger targets reach everything that uses the theme's size tokens, not components with fixed pixel sizes; reduce motion reaches animations that use the theme's duration tokens. Read aloud is built but not heard working (the test browser has no speech voices). No button on a phone yet; Alt+A works there with a keyboard. | Accessibility |
| Resizable panels, collapsible filters and statistics | Designed | Panels |
| Tabs open by default and the New tab catalog | Built for pages on wide screens and seen working in the demo build (`docs/screenshots/tabs.png`): every page starts open in page order, a closed tab stays closed, a page added later opens by default, close buttons show on the active tab and on hover or focus, the New tab catalog lists every page with search, and Open every tab reopens them all. Arrow, Home and End keys move between tabs. The catalog search is the shared search field and accepts patterns (seen working in the demo build). Bulk close is built and seen working in the demo build (`docs/screenshots/tabs-bulk-close.png`): with text in the catalog search, one button closes the open tabs that match and one closes those that do not, each showing its count; the list under the field is the preview; nothing closes for an empty search or an unusable pattern; the page in use stays open; Undo reopens what was closed. Not built: tabs on a phone, drag to reorder, pinned tabs, separate searches per group. | Tabs |
| Command palette on Ctrl+Shift+F | The existing quick bar is rebound to Ctrl+Shift+F and opens from the Search button in the top bar (seen working in the demo build). The key press itself is not yet seen working: the demo build does not register shortcuts. The redesigned palette with live controls is not built. | CommandPalette |
| Pattern workbench on every search | Partly built. Every search field (38 places, listed in `frontend/src/common/regex/search-surfaces.ts`) has a workbench button, and every list behind them accepts a regular expression written as `/pattern/flags`: tables, filter panes, pickers, the add dialogs, logs, the network maps, the state tool and the New tab catalog. Plain text stays the default. The engine is the browser's JavaScript engine; patterns are limited to 2,000 characters, values to 4,000, and a pattern that static screening marks as runaway is refused. A test walks the source and fails when a search field is added without a catalogue entry. Checked by unit tests (99 passing), lint and the type check. Seen working in the demo build on the New tab catalog (`docs/screenshots/pattern-workbench.png`, `pattern-search.png`): the button opens the workbench beside the field, the Test tab shows which items of the list match, Use writes the pattern back and the list filters, an invalid or runaway pattern shows nothing and turns the button red with the reason, Escape closes only the workbench, and focus returns to the field. Also seen working on a real table: in a running instance of the published image (build 26), a pattern on the Entities list left exactly the two matching rows, the workbench's list preview named the same two, and an invalid pattern showed nothing. Not yet seen in a build: filter panes, pickers and logs; those paths are covered by unit tests only. Not built: per-group tab searches. | Regex |
| Automation tests: every condition and every Choose option | Built and seen working in a running instance (`docs/screenshots/automation-option-test.png`). Each condition row has a visible test button, and each Choose option has a test button that checks all of the option's conditions now and reports whether the option would run. Nothing is run or saved by a test. Not built: named test cases, the dry run of a whole automation. | AutomationChoose, AutomationEditor |
| A Git repository for each automation, and a master repository | Built and seen working in a running instance. See `docs/automation-repositories.md`. Every save commits the automation in its own repository with a message naming what changed. Commit everything checks every automation, commits each that changed, then commits the master, which records the commit each automation is at, and pushes to remotes where one is set. 20 tests with real Git. Seen in the instance: two automations and the master committed by one push, and a commit on each save. **Not checked**: a push to a real remote host; the integration as part of a built image (it was loaded into a running image as a custom integration). Not built: the per-automation repository page, the repository strip in the editor, remote settings in the interface, pull, scripts and scenes. | AutomationRepo, AutomationsMaster |
| Automation history manager | Built and seen working in a running instance (`docs/screenshots/automation-history-run.png`, `automation-history-compare.png`). A History tab beside Automations lists every version of every automation with search (and the pattern workbench) and filters for failing, live and never tested. A version can be tested alone or many at once: whether it loads, and whether its conditions pass right now; four at a time, ten seconds each, with Stop; nothing in the house changes. Versions can be run for real, one after another, after a confirmation that names them, optionally asking before each one and leaving out anything that touches a lock, door, alarm, valve or siren. Two versions can be compared, an old version made live again, versions exported, and everything committed to the master with a message. Seen in the instance: test every live version, a correct condition failure with its reason, compare, a run of two versions with confirmations, commit everything. Not seen: make live, export, Stop during a long test, a narrow screen. Not built: named test cases and their columns, a simulated run that pretends the actions, schedules. | AutomationHistory |
| Context menus with working shortcuts | Partly built and seen working in a running instance (`docs/screenshots/element-menu.png`). Right-click, long press, the menu key or Shift+F10 on anything opens a menu for that element with a filter field (which has the pattern workbench), arrow keys, Enter and Escape. Entries: edit appearance, edit every one of the kind, reset, read aloud, copy the text, search and commands. Shortcuts shown in the menu come from the same list the key handler reads. Shift with a right-click gives the browser's menu; text fields keep theirs. Not built: entries specific to what was clicked (turn off, open, rename, hide), lock, history and export entries. | ContextMenu |
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
