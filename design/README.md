# Design

Design files for the Material Design 3 interface, kept in the repository so every canvas can be
read back from here alone. 295 boards on 23 canvases, at most 15 boards on each.

| Folder | Boards | What it holds |
| --- | --- | --- |
| `canvases/01-everyday` | 15 | Home, energy, phone layout, dashboards and their editor, map, activity, history, media, lists, calendar, lights, climate, security |
| `canvases/02-everyday` | 14 | Maintenance, embedded pages, profile, Assist, shortcuts, sign-in, first run, the preparing page, about, release notes |
| `canvases/03-settings` | 15 | Integrations, devices, entities, helpers and everything for automations: list, editor, choose and condition tests, version history, one repository per automation, the master repository, traces |
| `canvases/04-settings` | 15 | Settings home, scenes, scripts, blueprints, areas, labels, zones, apps, dashboards |
| `canvases/05-system` | 15 | Voice assistants, tags, people, users, energy setup, cloud, system, updates, repairs, logs, backups, analytics |
| `canvases/06-tools` | 15 | Network, storage, hardware, general, labs, restart and the developer tools |
| `canvases/07-protocols` | 11 | Zigbee, Z-Wave, Matter, Thread, Bluetooth, MQTT, infrared, LoRaWAN, serial, discovery, application credentials |
| `canvases/08-dialogs` | 12 | 36 entity dialogs, three to a board |
| `canvases/09-features` | 14 | Language, wording, narration, modes, schedules, identity, appearance editors, colour picker, fonts, accessibility, panels, tokens |
| `canvases/10-features` | 13 | Tabs, command palette, pattern workbench, context menus, guided forms, extensions, confirmation, locks, support, authenticator |
| `canvases/11-features` | 14 | History, export, bulk actions, changelog, help, notifications, converters, local models, hand-off, Minecraft, drawing, progress |
| `canvases/12-polish` | 10 | Polish pass: pattern workbench, element tools, lock wizard, unlock prompt and list of locks, phone and wide |
| `canvases/13-polish` | 11 | Polish pass: personal settings, guided setup list and wizard, setup guidance, developer tools on the rail, media search |
| `canvases/14-decisions` | 9 | The audit's decisions: phone bottom bar, open pages on a phone, picking by touch, replacing browser boxes, two-step confirmation, locks and workbench still to build, settings still to build |
| `canvases/15-site` | 14 | The project page: every tab and tool, the palette, element menu, appearance editor, workbench and lock keypad, wide and phone, light and dark, drawn from the live page in `docs/site/` |
| `canvases/16-deploy-assistant` | 15 | Deploy Assistant: first run, the deploy wizard (places on the left, the plan on the right), a place that needs setup, more options, live steps, ready with its link, instance manager, backups, downloads, Raspberry Pi card; drawn from the app by `source/pages/deploy_boards.py` |
| `canvases/17-deploy-assistant-more` | 15 | Deploy Assistant: writing a Pi card, extensions, tools, support, changes, settings, its design boards, features, status, a one-time code from a QR code, the update self-test, ADHD modes, the narrator, schedule rules; same script |
| `canvases/18-deploy-assistant-care` | 15 | Deploy Assistant: accommodations, schedule rules, the logo, exports, record history, two-key confirmation, the live chart, dim sum, converting and Base64; same script |
| `canvases/19-deploy-assistant-tools` | 15 | Deploy Assistant: drawing, QR codes, the unlock ladder, School mode, the extension manager, notifications, Chocolatey setup, the Minecraft dashboard and its console; same script |
| `canvases/20-deploy-assistant-managers` | 9 | Deploy Assistant: the Minecraft world generator, AI models, virtual disks, Ctrl Shift F and a narrow window; same script |
| `canvases/21-dashboard-editor` | 4 | The dashboard editor's Dashboard tools: outline and bulk actions, replacing an entity, the check, templates, statistics, the preview width and a phone; drawn by `source/pages/p_editor.py` |
| `canvases/22-live-app` | 15 | Home Assistant pages drawn from a running copy instead of by hand: each board shows one page at 1440 and 390 pixels, after the polish pass that fixed the tab strip, phone tables, scenes, to-do and personal settings; drawn by `source/pages/live_boards.py` |
| `canvases/23-modern-remake` | 10 | A modern remake: one navigation pane that docks to any edge, collapses to icons or floats anywhere, plus settings, the automation editor and history, colour, apps and phone screens, light and dark; drawn by `source/modern/boards.py` |
| `canvases/24-modern-everyday` | 29 | Every everyday board (canvases 01 and 02) redrawn in the modern look, with staggered entry motion; drawn by `source/modern2/g_everyday.py` |
| `canvases/25-modern-settings` | 30 | Every settings board (canvases 03 and 04) in the modern look; drawn by `source/modern2/g_settings.py` |
| `canvases/26-modern-system` | 30 | System and tools (canvases 05 and 06) in the modern look; drawn by `source/modern2/g_system.py` |
| `canvases/27-modern-protocols` | 23 | Protocols and entity dialogs (canvases 07 and 08) in the modern look; drawn by `source/modern2/g_protocols.py` |
| `canvases/28-modern-features` | 45 | Features (canvases 09 to 11) in the modern look, plus the animation and transition editor and phone boards showing every feature moved, never removed; drawn by `source/modern2/g_features.py` |
| `canvases/29-modern-polish` | 34 | Polish, decisions and dashboard tools (canvases 12 to 14 and 21) in the modern look; drawn by `source/modern2/g_polish.py` |
| `canvases/30-modern-editors` | 32 | New automation and dashboard editor features (flow view, trace, simulator, conflicts, breakpoints, screens, visibility, interactions and more) and the problem detector everywhere, with Repairs and Teleport; drawn by `source/modern2/g_editors.py`. A personal wording file passed as `WORDING_FILE` renames the detector's words |
| `canvases/31-modern-requests` | 44 | The most requested community features, one category per page: scenes and the raw configuration editor; the automation editor (live states, fast mode for big automations, trigger groups, relationships, simple and advanced modes); performance and storage; dashboard editing (multi-select, a clipboard shared between tabs, duplicating, a dashboards list, swiping); cards (styling, pop-ups, history graphs, the light slider, energy colours, and the rainbow that opens the infinite colour picker on every colour row); dashboards for everyone (defaults, roles, room-first); wall tablets and the phone app (kiosk mode, remote wake, widgets, the car, offline); setup forms; entities, devices and accessibility (an accessible entity picker, device notes, shortcuts); customisation; and phone boards. Drawn by `source/modern2/g_requests.py` |
| `canvases/32-modern-cameras` | 10 | The event timeline under the camera player (live, playback, dark, before recording is set up), around-the-clock recording with guided setup (destination, connection test passing and failing, cameras and limits), recording status, and phone boards. Drawn by `source/modern2/g_cameras.py` |
| `canvases/33-updates` | 7 | The Updates page: the "Update coming soon" card with a progress bar for the build that is on its way (seven stages, every job, estimates), all eight states of that card (waiting in line, Core ready, finished, failed, replaced, nothing coming, asked too often, cannot be reached), and the comparison of two versions with a side-by-side table, filters by part of the product, a search and the list of changes per build, on a wide window and on a phone; plus two boards for the separate updates log site (one version, and all versions with search, filters and a calendar that counts versions and changes per day), and an interactive board of the two-key confirmation with its dramatic motion. Drawn by hand in the design canvas; the boards are fluid pages, not fixed frames |
| `canvases/34-polish` | 6 | The direction for modernising every page: one loud thing per page and everything else quiet, headings in heavy widened type, counts as big numerals, statistics tiles that also filter, tall rounded rows. The front door, the Settings front and a list page on a wide window, the front door and Settings on a phone, and an interactive board of the six moments that earn dramatic motion (arriving, a count changing, saved, deleted, an update finishing, an error), scaled by the confirmation drama preference and still under reduced motion. The folder's `README.md` lists the rules and the motion values |
| `canvases/35-features` | 13 | New features, one page per category: the automation editor redrawn with a visual editor for every action and helpers managed in place, modern dialogs and phone bottom sheets, one shared empty state, statistic tiles that filter with a docked create button and a toast that never covers rows, tidied developer tools, update history with going back, backup self-check, USB stick maker and offline update pack, the "while you were away" digest, device health, automation dry run, the room setup wizard, and the cloud host through a tunnel. The folder's `README.md` lists the boards and the rules they carry |
| `canvases/36-rich-editors` | 4 | Rich editors for every entity kind: the Speak action redrawn (who speaks, what is said, how it sounds), a light's colour picked with a real colour picker and warm-to-cool white within the lamp's range, the catalogue of which control each kind of value gets, and what every entity kind's editor contains, on a wide window and on a phone. The folder's `README.md` lists the boards and the rules they carry |
| `canvases/37-integration-editors` | 4 | Rich editors for every integration, drawn as real app screens at phone width: three editors unique to their integration, the action picker with its ten families, setup forms as bottom sheets (home network device, sign-in at a provider, which control each field gets), and triggers, conditions and building blocks. The folder's `README.md` lists the boards and the rules they carry |
| `canvases/38-progress-drafts-entities` | 4 | Detailed progress, drafts and every entity kind, as real app screens at phone width: compact update rows with the "Update coming soon" card and an installing update with stages and live output; a running backup with each stage and each upload place on its own row and the check of each copy; autosaved drafts with history, export and import; and the row, detail sheet and tile every entity kind gets. The folder's `README.md` lists the boards and the rules they carry |
| `canvases/39-ac-defender` | 1 | AC Defender brought in as an integration, as real app screens at phone width: setup from Add integration, its own page saying what it is doing and why, and its guards as switches that automations can read and turn. The folder's `README.md` lists the rules it carries |
| `canvases/40-search-top-bar` | 1 | A search button in the top bar of every page that has a search, so it is one tap away on a long page without scrolling back up. Opening it keeps the page where it is; settings pages jump to the match, list pages filter in place. The folder's `README.md` lists the rules it carries |

In each canvas folder, `canvas.json` is the index (one entry per board with its frame and title)
and every `*.dc.html` is one board, a self-contained page.

- `source/pages/*.py` describe the page boards as data. `lib.py` holds the shared parts: the
  application frame, page header, tables, settings rows, dialogs. A change there reaches every
  board built from it.
- `source/*.src.html` are the board sources before the shared stylesheet (`m3.css`) and icon paths
  (`icons.json`, from the Material Design Icons package the frontend already depends on) are
  inlined. Run `node source/inline-assets.mjs <Name>` to rebuild one board.
- `frames/` holds a review render of every board.

These files are a design proposal. Nothing here is a claim that the interface is implemented,
verified or shipped. `HANDOFF.md` in this folder tracks the state of each pass, and
`docs/feature-status.md` tracks what is built.
