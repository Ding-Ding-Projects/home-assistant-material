# Roadmap

The goal is fixed: **every board in `design/canvases/` built into the product, 153 of 153, and the
running product matching its board.** This file lists all of it. `docs/feature-status.md` says
exactly what has been seen working and where.

- `[x]` built and seen working in a running build
- `[~]` partly built; the line says what is missing
- `[ ]` not started

## Foundation

- [x] Vendor the upstream sources at pinned releases
- [x] Release workflow: one tagged release per push
- [x] Container images, publicly pullable
- [x] Update feed on the `channel` branch, supervisor and operating system pointed at it
- [x] The published container image starts and serves the interface (build 26, run from the
      registry and driven through first-run setup)
- [~] Operating system images: the VirtualBox image is attached to release `v2026.11.1.1`; the
      Raspberry Pi images were still building
- [ ] Boot the VirtualBox image and complete first-run setup
- [ ] Boot a Raspberry Pi image and complete first-run setup
- [ ] Observe a core update from one build to the next through Settings
- [ ] Add the operating system signing secrets and observe an over-the-air operating system update
- [ ] Run `build.bat --run` and `build-installer.bat` on Windows

## Hosting

- [x] `compose.yaml` that runs the published image, with the port and storage mapped
- [~] `host.sh` and `host.bat`: pull, start, wait for health, print the address; a detached mode
      and a live log view. `host.sh` was run for real on Linux; `host.bat` has not been run on
      Windows
- [ ] A live demo of the interface on the web. The demo build expects to be served from the root
      of a domain, so it needs its own domain or sub-path support first
- [ ] A setup wizard for Windows that performs the same steps

## Shell and cross-cutting features

- [~] Tokens: colour, type and shape are in; motion tokens and a dark theme check are not
- [x] Rail, floating pane and pill tabs; the rail is compact unless opened
- [~] Top bar: search, edit appearance, language, accessibility and the user's picture. The
      language button opens the profile's language page; there are no language modes yet
- [x] Bar of open pages: every page open by default, New tab catalog, close and reopen
- [x] Bulk close: close the tabs that match a search, or the ones that do not, with Undo
- [ ] Tabs on a phone, drag to reorder, pinned tabs, a search for each group
- [x] Accessibility tools: text size, contrast, reduced motion, focus ring, larger targets, read
      aloud, keyboard help
- [x] Pattern workbench on every search field, regular expressions in every list
- [x] Private vocabulary file: choose or drop, checked in full, replace, clear
- [~] Command search on Ctrl+Shift+F: opens from the top bar; the redesigned palette with live
      controls is not built
- [x] Per-element appearance editor: fill layers, text, shape, accent, size; this element or
      every one of its kind; menu, shortcut and pick tool
- [~] Context menus on every element: the menu, its filter and shortcuts are in, with export,
      history and lock for the page the element is on; entries specific to what was clicked
      are not
- [~] Page tools in every page header: search this page, edit appearance, read aloud, history,
      export, lock and help, with a footer line on every page. On every page layout: settings
      pages, history, activity, media, to-do lists, calendar and the developer tools. Dashboards
      have the footer, the lock and the tools in the right-click menu, but no header cluster.
      Dialogs have their own row: search this dialog, edit appearance and lock; history and
      export are not offered inside a dialog
- [~] Locks and the unlock ladder: a whole page can be locked, unlocked by a hold or a PIN, with
      growing waits after wrong PINs. Locks on single elements are not built
- [ ] Two-key confirmation for destructive actions
- [~] Local version history: appearance, accessibility and open tabs, with undo, from every page
      that has the page tools. Not in dialogs; nothing kept on the server
- [~] Export from every page that has the page tools: CSV, JSON, Markdown, plain text, HTML and
      print. No spreadsheet or PDF file formats, and a table exports its stored values
- [ ] Bulk actions on every table
- [ ] Guided forms and per-control information buttons
- [ ] Settings that explain themselves
- [ ] Resizable panels, collapsible filters and statistics
- [ ] Notification centre and toasts
- [ ] Progress where it started, recovery where it broke
- [ ] Starting points for blank editors
- [x] Version and updated-at on the first screen
- [ ] Free, with nothing to buy: the About page

## Language and voice

- [ ] Language modes: English, playful Cantonese, both
- [ ] Playfulness sliders and the dialog emoji switch
- [ ] Spoken narrator and action sounds
- [ ] School mode and focus modes
- [ ] Scheduled and external settings sources
- [ ] Renaming the app and logo customization
- [ ] Dim sum surprise

## Appearance

- [ ] Colour picker and translator
- [ ] Fonts and type scale
- [ ] Appearance editor for type
- [ ] Appearance editor for fill and layers: picture layers, masks, blend, per-state layers

## Automations

- [x] Test buttons on every condition and every Choose option
- [x] A Git repository for each automation; every save is a commit
- [x] A master repository; one push commits every automation repository, then the master
- [x] History manager: every version, compare, make live, test one, test many, run many, export
- [ ] Named test cases, and a simulated run that pretends the actions
- [ ] A dry run of a whole automation from the editor
- [ ] The repository page for one automation and the repository strip in the editor
- [ ] Remote settings and pull in the interface; a push to a real remote host checked
- [ ] Repositories for scripts and scenes
- [ ] Automation list, editor and trace pages redrawn to their boards

## Pages redrawn to their boards

Shared by every list page under Settings (27 pages) and seen side by side with the Devices,
Entities and Automations boards: the breadcrumb and title in the header, the large title with
a summary line, rows as rounded cards, an export button beside the table settings, and the
footer line. Still different from those boards: filters are a side pane and not chips in the
row, rows have no icon tile or second line, the checkboxes appear only in selection mode, and
long lists scroll instead of loading more.

Each line is a canvas folder in `design/canvases/`. A page counts when the running product
matches its board, checked side by side.

- [~] `01-everyday`: Home has its greeting, a sentence about the home and scene buttons; its
      large cards and rooms row are not built. Energy, the phone layout, dashboards and their
      editor, card picker, map, activity, history, media, lists, calendar, lights, climate and
      security are not redrawn (15 boards)
- [ ] `02-everyday`: maintenance, embedded pages, profile, profile security, Assist, shortcuts,
      states, links, sign-in, first run and its steps, the preparing page, about, release notes
      (14 boards)
- [ ] `03-settings`: integrations, integration page, add integration, devices, device, entities,
      entity settings, helpers, and the automation pages (15 boards)
- [~] `04-settings`: settings home is drawn to its board; scenes, scripts, blueprints, areas,
      labels, zones, apps, app store and dashboards are not (15 boards)
- [ ] `05-system`: voice assistants, voice pipeline, expose, tags, people, users, energy setup,
      cloud, system, updates, repairs, logs, backups, analytics (15 boards)
- [ ] `06-tools`: network, storage, hardware, general, labs, AI ids, restart, and the developer
      tools (15 boards)
- [ ] `07-protocols`: Zigbee, Z-Wave, Matter, Thread, Bluetooth, MQTT, infrared, LoRaWAN, serial,
      discovery, application credentials (11 boards)
- [~] `08-dialogs`: every dialog has the row of tools at its foot and the entity dialogs have
      history, settings and more in their header, as on the boards. The controls inside each of
      the 36 entity dialogs are not redrawn (12 boards)

## Tools

- [ ] Extension support
- [ ] Support tickets
- [ ] Authenticator and QR pairing
- [ ] Changelog viewer
- [~] Offline help articles: 12 articles in the Help tool, searchable. No article per page yet
- [ ] Rendered provider text
- [ ] File converter
- [ ] Base64 toolkit
- [ ] Minecraft server manager and world generator
- [ ] Local Ollama suite
- [ ] External editor hand-off and publishing to a forge
- [ ] Drawing and annotation

## Later

- [ ] Appliance variant of the operating system that boots straight into a single container application
- [ ] Add-on repository for the owner's own container applications
- [ ] Dedicated build application
- [ ] Project website with one article per feature
- [ ] Dark theme boards for every screen
- [ ] Native review of the Cantonese copy
