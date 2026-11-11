# Roadmap

The goal is fixed: **every board in `design/canvases/` built into the product, 237 boards on 18
canvases (canvases 01 to 15 and 16 to 18 for the Deploy Assistant), and the running product
matching its board.** This file lists all of it. `docs/feature-status.md` says exactly what has
been seen working and where.

- `[x]` finished and seen working in a running build
- `[~]` partly built; the line says what is missing
- `[ ]` not finished: either not started, or built and not yet seen in a running build (the line
  says which)

Nothing is deleted from this list. An item that is dropped is struck through with the reason.

## Foundation

- [x] Vendor the upstream sources at pinned releases
- [x] Release workflow: one tagged release per push
- [ ] Release workflow compares a push with the last build that published images, so a
      documentation-only push on top of unbuilt code still builds that code. Built; builds 64 and
      65 went out without images before the fix, and no push since has shown the fix working
- [x] Every release carries the newest Deploy Assistant installers, copied on straight after the
      release is created. Seen on v2026.11.1.88, .91 and .93. Runs replaced by a newer push are
      cancelled and leave no release. (The 37 releases with no files that the old workflow left
      were removed by hand.)
- [ ] Release workflow: a push that changes only documentation or design files publishes no
      release. Built; not yet observed. A run that attaches no file of its own withdraws its
      release and tag (built, not observed)
- [x] A plain `git clone` checks out on Windows 11: the two systemd mount units with a backslash
      in their names are stored as `__x2d__`. The rename back to the real names in the operating
      system post-build script is not yet seen in an operating system build
- [x] The local frontend container build no longer crashes on a machine with many processors
      (held to four processors, two on a retry). Seen on one computer; a second computer has not
      tried it
- [x] Container images, publicly pullable
- [x] Update feed on the `channel` branch, supervisor and operating system pointed at it
- [x] The published container image starts and serves the interface (build 26, run from the
      registry and driven through first-run setup)
- [~] Operating system images: the VirtualBox image and the Raspberry Pi images are attached to
      releases. `haos_ova-18.5.33.ova` started on VMware Workstation and showed first-run setup.
      Not yet booted in VirtualBox or on a Raspberry Pi
- [ ] Boot the VirtualBox image and complete first-run setup
- [ ] Boot a Raspberry Pi image and complete first-run setup
- [x] The hosted instance on the owner's network runs build 2026.11.1.96 (builds 88 and 91 were
      skipped on purpose: they had a defect where settings saved on the instance could cross
      between two accounts on one browser; fixed in batch 18)
- [ ] Observe a core update from one build to the next through Settings. Update install progress
      and the recovery card are built and not yet seen
- [x] Add the operating system signing secrets (set 10 November 2026)
- [ ] Observe an over-the-air operating system update between two builds signed with them. No
      operating system image has been booted with an over-the-air update
- [ ] Run `build.bat --run` and `build-installer.bat` on Windows
- [ ] Run `deploy-assistant\build.bat` on Windows (added by another lane; not run)

## Hosting

- [x] `compose.yaml` that runs the published image, with the port and storage mapped
- [~] `host.sh` and `host.bat`: pull, start, wait for health, print the address; a detached mode
      and a live log view. `host.sh` was run for real on Linux; `host.bat --detached` was run on
      Windows 11 with build 46. The interactive log view on Windows has not been run
- [ ] A live demo of the interface on the web. The demo build expects to be served from the root
      of a domain, so it needs its own domain or sub-path support first
- [ ] A setup wizard for Windows that performs the same steps
- [ ] Test address through the tunnel: it still answers 502 until one proxy entry is added on
      the tunnel host (see `HANDOFF.md`)

## Shell and cross-cutting features

- [~] Tokens: colour, type and shape are in, and the new pages were checked in the dark scheme;
      motion tokens are not
- [x] Rail, floating pane and pill tabs; the rail is compact unless opened
- [~] Top bar: search, edit appearance, language, accessibility and the user's picture. Built;
      the language and picture buttons are not yet seen in a running build
- [x] Bar of open pages: every page open by default, New tab catalog, close and reopen
- [x] Bulk close: close the tabs that match a search, or the ones that do not, with Undo
- [ ] Tab dragging and pinning, the order and pins in page history, and the phone sheet that
      follows them. Built; not yet seen in a running build. Not built: a search for each group
- [ ] Phone bar: Home, Search, Pages, Access and Menu at the bottom, a slim bar of open pages at
      the top. Built; not yet seen in a running build. The bar hides on scroll only on pages that
      scroll the window
- [x] Accessibility tools: text size, contrast, reduced motion, focus ring, larger targets, read
      aloud, keyboard help
- [ ] Accessibility: line spacing, letter spacing and a fonts dialog. Built; not yet seen in a
      running build
- [x] Pattern workbench on every search field, regular expressions in every list
- [x] Private vocabulary file: choose or drop, checked in full, replace, clear
- [ ] Wording file celebration and sounds. Built; not yet seen in a running build
- [~] Command search on Ctrl+Shift+F: opens from the top bar; the search of everything lists
      settings and entities with a live switch (built, not yet seen; pointer only so far)
- [x] Per-element appearance editor: fill layers, text, shape, accent, size; this element or
      every one of its kind; menu, shortcut and pick tool
- [~] Context menus on every element: the menu, its filter and shortcuts are in, with export,
      history and lock for the page the element is on, and a lock for the element itself;
      entries specific to what was clicked are not
- [~] Page tools in every page header: search this page, edit appearance, read aloud, history,
      export, lock and help, with a footer line on every page. Dashboards have the footer, the
      lock and the tools in the right-click menu, but no header cluster. Dialogs have their own
      row: search this dialog, edit appearance and lock
- [~] Locks and the unlock ladder: a whole page, a dialog or a single element can be locked,
      unlocked by a hold or a PIN, with growing waits after wrong PINs. Unlocking elements with
      the PIN is written but only the hold was exercised; the other rungs of the board's ladder
      are not built
- [ ] Locks with their own credentials and the lock wizard: six ways in, QR code, countdown,
      list of locks. Built; not yet seen in a running build
- [x] Two-key confirmation for destructive actions: every question marked destructive asks for
      two keys and a slide
- [~] Local version history: appearance, accessibility and open tabs, with undo, from every page
      that has the page tools. Not in dialogs; nothing kept on the server
- [~] Export from every page that has the page tools: CSV, JSON, Markdown, plain text, HTML and
      print; a tab-separated format and selected-rows-only are built and not yet seen. No
      spreadsheet or PDF file formats
- [ ] Selection bar and bulk actions on every table. The bar is built on Notifications, Labels,
      Automations and Scripts and not yet seen; the other tables do not have it
- [~] Guided forms and per-control information buttons: the information buttons are built and not
      yet seen. Not built: the worked example and the practise control
- [ ] Settings that explain themselves. Personal settings does and the information buttons exist
      (built, not yet seen); other pages do not
- [~] Resizable panels, collapsible filters and statistics: split panes and a resizable filter
      pane are built and not yet seen. Not built: collapsible statistics
- [~] Notification centre and toasts: notifications are a page with a search and selection;
      30-day history with Undo is built and not yet seen; the board's colours by severity,
      action buttons and stacked toasts are not built
- [~] Progress where it started, recovery where it broke: the activity tray and the recovery card
      are built and not yet seen; update installs show real stages and a recovery card with
      actions (built, not seen). Not built: the update dialog in the tray; draft recovery is
      design only
- [x] Phone fixes seen in build 96 at 390 px: the Marketplace list scrolls with its group header
      pinned, the Personal settings preview scrolls away, the accessibility panel's rows no
      longer overlap. Not seen: the "+" text size button staying on one line (batch 19)
- [~] Starting points for blank editors: built for an empty template editor and an empty dashboard
      sections view, not yet seen. Not built: other empty editors
- [x] Version and updated-at on the first screen
- [x] Free, with nothing to buy: the About page says so, and says the project is independent
- [ ] Link confirmation for a link that opens a page of the interface from outside. Built; not
      yet seen in a running build
- [ ] Not-found screen for unknown pages under Settings, and the starting, connection lost,
      no-access, loading and error screens. Built; not yet seen in a running build
- [ ] Help links open a copy of the article inside the interface, with 40 articles and 1,392
      integration pages bundled (licence CC BY-NC-SA 4.0, with attribution). Built; not yet seen
      in a running build. Open review findings are listed in `HANDOFF.md`
- [x] Nothing is sent out: analytics, crash reports and diagnostics are removed
- [ ] Problem log in a Git repository in the configuration folder, with private values removed.
      A forced error produced files and a commit in a running copy; the page that lists the
      problems is not yet seen

## Setup and first run

- [ ] First-run setup: three steps, password strength, a preview of dates and units, a review
      step, no cloud restore or outside links, no outside map lookup without a button. Built; not
      yet seen in a running build (the Welcome screen was seen with the old items; the fix is
      unseen). Open: the integrations step is not interactive and a failed flow can leave both
      buttons off
- [ ] Every setup wizard is a fully interactive setup (real controls for every value, live
      validation, a real test where the server can do one, a live summary, Back and Next, jump
      to a step, save and resume, skip for optional steps). Guided setup, lock wizard, Google
      setup and backup setup are built and not yet seen; save and resume and jump to a step are
      not confirmed for each
- [~] Guided setup for integrations without a setup screen: 223 of 240 get drawn fields and 17
      one checked YAML box; two were saved through the interface's connection. The wizard in the
      interface is not yet seen
- [ ] Google one-time setup under Settings. Server status and a refused bad key were driven in a
      running copy. Enabling services with a real key, the client file, the sign-in and the
      status of connected Google integrations are not exercised; the Nest registration guidance
      is not built
- [ ] Passkey sign-in beside the password, with add and remove on the profile. The server tests
      (143) pass in a running copy; the sign-in page and the card are not yet seen and no real
      authenticator has been used. Review findings are listed in `HANDOFF.md`
- [ ] Backups: encryption off by default, a stored key never replaced without asking. Built; not
      yet seen in a running build

## Language and voice

- [ ] Language modes: English, Cantonese, both. Built for this project's own surfaces; not yet
      seen in a running build. Cantonese for other pages is not written
- [ ] Playfulness sliders that change real messages and the dialog emoji switch. Built; not yet
      seen in a running build
- [ ] Spoken narrator (on-device voices only) and action sounds. Built; not yet seen or heard
- [ ] School mode, one thing at a time and attention modes (a clock, an offer to go back).
      Built; not yet seen in a running build
- [~] Scheduled and external settings sources: time rules and shared defaults for personal
      settings are built and not yet seen. Not built: triggers from an entity or a web service
- [ ] Appearance choices and the personal wording file saved on the instance for the signed-in
      account, kept in backups. Built; not yet seen in a running build, and not tried from a
      second computer or after a restore. Batch 18 ties the saved settings to the account so
      another account's cache is cleared first (unit tests; not seen with two accounts)
- [ ] The paid cloud service is no longer shown anywhere in the interface (the server integration
      is unchanged). Built; not seen. Open: an old logbook entry can still name it as an actor,
      and a voice pipeline already set to a cloud voice shows a blank picker
- [ ] Cantonese for eight more blocks, with a test that keeps them complete. Built; not seen
- [ ] Renaming the app and logo customization. Built; not yet seen in a running build
- [ ] Dim sum surprise (built only in the Deploy Assistant)

## Appearance

- [~] Colour picker and translator: a Colour tab was seen; the appearance editor now has its own
      picker (built, not yet seen); the board's named palette and rainbow are not built
- [ ] Fonts and type scale. A fonts dialog is built and not yet seen; the type scale is not built
- [ ] Appearance editor for type
- [ ] Appearance editor for fill and layers: picture layers, masks, blend, per-state layers

## Automations

- [x] Test buttons on every condition and every Choose option
- [ ] The Choose step tests and runs one option, the default actions or the whole step; Run now
      for automations and scripts asks first. Built; not yet seen in a running build
- [x] A Git repository for each automation; every save is a commit
- [x] A master repository; one push commits every automation repository, then the master
- [x] History manager: every version, compare, test one, test many, run many
- [ ] History manager: make live, export, Stop during a long test, a narrow screen. Built; not
      yet seen
- [ ] Automation editor motion, enable switch, Check button and history strip. Built; not yet
      seen in a running build. Review findings are listed in `HANDOFF.md`
- [ ] Script editor redrawn with a mode selector, Run now and See past runs. Built; not yet seen.
      Open: Save in a bottom bar
- [ ] Named test cases, and a simulated run that pretends the actions
- [ ] A dry run of a whole automation from the editor, and a bottom bar next to Save
- [ ] The repository page for one automation and the repository strip in the editor
- [ ] Remote settings and pull in the interface; a push to a real remote host checked
- [ ] Repositories for scripts and scenes
- [ ] Backups carry every automation repository with its history, and a restore brings them
      back. Read only so far: neither exclude list names the folder. Not proven with a real
      backup and restore
- [ ] Automation list, editor and trace pages redrawn to their boards

## Dashboards

- [ ] Built-in pages such as Overview have "Edit cards and layout", which makes an editable copy.
      Seen at phone width (confirmation, default-page question, the copy opening); opening the
      copy straight in edit mode and the welcome banner over the Overview header at phone width
      are fixed in source and not yet seen
- [ ] Export a dashboard, import a dropped dashboard file with a summary of outside addresses,
      custom cards and service-calling buttons, and Undo. Built; not yet seen
- [~] History per dashboard and per tab, with a remote and push. Server commands were driven in a
      running copy (two saves, history, restore, delete archived); the page, set remote and push
      are not seen, and no push to a real remote has been made. The archive list (list, bring back
      or remove the histories of deleted dashboards) is built and not yet seen
- [ ] Review findings fixed in source and covered by server tests (Minecraft over SSH, automation
      and dashboard history, Ollama, shared identity, import summary); the pages that show them
      are not yet seen
- [ ] Dashboard tools in edit mode: outline with bulk actions, find and replace of an entity ID,
      a check, card templates, statistics and preview width. Built; unit tests of the editing
      functions only, the dialog is not yet seen
- [ ] Dashboard history and automation history: a search field and a searchable version picker
      for Compare, and "Git remote" in full on the history and recorded problems pages. Built;
      not yet seen
- [ ] One save bar in every automation, script and scene editor mode (a read-only automation no
      longer shows an enabled Save). Built; not yet seen. Open: the bar can leave a blank strip
      when the phone's bottom bar hides on scroll

## Pages redrawn to their boards

Shared by every list page under Settings (27 pages) and seen side by side with the Devices,
Entities and Automations boards: the breadcrumb and title in the header, the large title with
a summary line, rows as rounded cards, an export button beside the table settings, and the
footer line. Filter chips beside the search, a tick box on every row and a line under the list
are built for Devices, Entities, Labels and the list of automations and not yet seen. Still
different from the boards: rows have no second line on most pages, and long lists scroll
instead of loading more.

Each line is a canvas folder in `design/canvases/`. A page counts when the running product
matches its board, checked side by side.

- [~] `01-everyday`: Home has its greeting, a sentence about the home, scene buttons and the
      large cards for a room's lights, the thermostat, the locks and what is playing (seen).
      Lights, Security, Climate, Map, Activity, History, To-do, Calendar and Energy are started
      and not seen. Not started: the dashboard title row and the card picker (15 boards)
- [~] `02-everyday`: About was seen. Started, not seen: maintenance, profile, sign-in, first run,
      Assist, states, links, the status screens, release notes. Not drawn: shortcuts (14 boards)
- [~] `03-settings`: started and not seen: integrations, integration page, add integration,
      devices, device, entities, entity settings, helpers (15 boards)
- [~] `04-settings`: settings home is drawn to its board and was seen. Scenes, scripts,
      blueprints, areas, labels, zones, apps, app store and dashboards are started and not seen;
      the dashboards page and its Add dashboard dialog were seen at phone width (15 boards)
- [~] `05-system`: System is drawn to its board and was seen. Voice assistants, expose, tags,
      people, users, energy setup, cloud, updates, repairs, logs and backups are started and not
      seen. The Analytics board is obsolete and will not be built (15 boards)
- [~] `06-tools`: Storage, General, Labs, Restart, Events, Hardware, Network and the developer
      tools states, actions, template, YAML, statistics and Assist are written to their boards
      and not seen. Not started: AI and entity IDs; the debug page is not drawn (15 boards)
- [~] `07-protocols`: Zigbee, Z-Wave, Matter, Thread, Bluetooth and MQTT are started and not
      seen. Infrared, LoRaWAN, serial, discovery and application credentials are partly drawn;
      several need data the server does not supply (11 boards)
- [~] `08-dialogs`: every dialog has the row of tools at its foot (seen). 35 of 36 entity dialogs
      are redrawn with a tab row and tools block, and the shared controls follow the boards behind
      an opt-in; not seen. Open review findings are listed in `HANDOFF.md` (12 boards)
- [ ] `09-features`, `10-features`, `11-features`: see the Tools section (41 boards)
- [~] `12-polish`, `13-polish`, `14-decisions`: written to the boards, not seen in a running
      build (30 boards)
- [~] `15-site`: the project page is built and was checked in Chrome at 1440 and 360 px (14 boards)
- [~] `16-deploy-assistant`, `17-deploy-assistant-more`, `18-deploy-assistant-care`: see the
      Deploy Assistant section (40 boards)

## Tools

- [ ] Extension support (built only in the Deploy Assistant)
- [ ] Support tickets (a component exists and is not wired to a page)
- [~] Authenticator and QR pairing: the authenticator card on the profile page is built and not
      yet seen; the code generator in Tools is not built (the browser has no credential vault);
      QR pairing is the lock wizard's QR step, already built and not yet seen
- [x] Changelog viewer: What changed, under Settings, About
- [ ] Release notes page. Built; not yet seen in a running build
- [~] Offline help articles: the Help tool with 12 articles was seen; 40 articles and 1,392
      integration pages are bundled and not yet seen; no article per page yet
- [ ] Rendered provider text
- [~] File converter: data formats, images, text transforms, archives (ZIP, TAR, GZIP), pictures,
      text and Markdown to PDF, Word documents to and from text, audio to WAV and a still picture
      from a video are built and not yet seen. Not offered: reading PDFs, MP3 output and
      video-to-video conversion
- [x] Base64 toolkit: encode, decode and data URLs for text and files, under Tools
- [~] Minecraft server manager: definitions, SSH hosts, version lookup, the Docker over SSH
      target (start, stop, log) and a server page with overview, logs, settings and removal tabs
      are built and covered by 217 server tests; the manager has never been run against a real
      Docker host and the page is not seen. Not built: the other four targets, backups, the world
      generator
- [~] Local Ollama suite: servers, models, pull with progress and Cancel, delete, unload, model
      details with the assistants that use a model, and a test chat that cannot control the home
      are built (88 server tests, fake streams); the page has never been run against a real
      Ollama server and is not seen. Not built: helpers
- [ ] Support page with a local support bundle that is never sent anywhere. Built; not yet seen
- [ ] Media folders: create, rename, move and delete in the Manage dialog, and the "Add media"
      fix reported broken on an iPhone (fixed in source only), the image upload button and the
      filter field on every media folder. Built; 109 server tests pass; not yet seen
- [ ] Embedded page panel: reload and a notice when a page refuses framing. Built; not yet seen
- [ ] External editor hand-off and publishing to a forge
- [~] Drawing and annotation: a drawing board under Tools, built and not yet seen

## Deploy Assistant

- [~] One-click deploys, instances, backups, automatic downloads, Raspberry Pi cards. Docker on
      this computer was run end to end (two instances, backup, restore, removal) and the card
      writer wrote and read back a test image. Not seen on Windows or macOS hardware; SSH hosts,
      VirtualBox, VMware and a real card are not seen working
- [ ] Verify SSH host keys (trust on first use with a stored fingerprint); confirm the drive
      before a card is wiped; ask before the automatic download connects to saved hosts
- [ ] Auto-update applying a real release on Windows
- [ ] Virtual disks, game servers, local models and drawing in the Deploy Assistant
      (`deploy-assistant/FEATURES.md`). Later commits by another lane add a converter, a Base64
      toolkit, a QR maker, a drawing tab, shared School mode and an extension manager; none of it
      has been run or seen by this work

## Later

- [ ] Appliance variant of the operating system that boots straight into a single container application
- [ ] Add-on repository for the owner's own container applications
- [ ] Dedicated build application
- [~] Project website with one article per feature: the site is published; one article per
      feature is not
- [ ] Dark theme boards for every screen
- [ ] Native review of the Cantonese copy
- [ ] Companion phone app: it connected after a proxy fault was fixed; some setup problems the
      owner reported are not yet described or fixed
