# Design

Design files for the Material Design 3 interface, kept in the repository so every canvas can be
read back from here alone. 212 boards on 16 canvases, at most 15 boards on each.

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
| `canvases/16-deploy-assistant` | 15 | Deploy Assistant: first run, one click per target, options, live steps, ready with its link, instance manager, backups, downloads, Raspberry Pi card, Ctrl Shift F, a narrow window; drawn from the app by `source/pages/deploy_boards.py` |

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
