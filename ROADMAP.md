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
      system post-build script was seen in the operating system build of build 109: its log shows both
      mount units enabled under their real names
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
- [x] The hosted instance on the owner's network runs build 2026.11.1.106 (builds 88 and 91 were
      skipped on purpose: they had a defect where settings saved on the instance could cross
      between two accounts on one browser, fixed in batch 18; builds 102 and 105 were skipped on
      purpose too: 102 lacked the media folder safety fix and 105 had the first version of the
      activity record)
- [ ] Observe a core update from one build to the next through Settings. Update install progress
      and the recovery card are built and not yet seen
- [x] Add the operating system signing secrets (set 10 November 2026)
- [ ] Observe an over-the-air operating system update between two builds signed with them. No
      operating system image has been booted with an over-the-air update
- [ ] Run `build.bat --run` and `build-installer.bat` on Windows
- [ ] Run `deploy-assistant\build.bat` on Windows. Run once on 12 November: install, 21 tests
      and the window build passed; the installer step made nothing on Node.js 26 (the script
      now says so straight after the install). Run again the same day with a portable
      Node.js 22: exit 0 and the installer was made. Installing it is not verified

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
- [~] Tab dragging and pinning, the order and pins in page history, and the phone sheet that
      follows them. Built; not yet seen in a running build. A separate search for each group of
      the New tab catalog (Pinned, Pages, Settings, Tools) is built, with a Close matching button
      on Pinned and Pages; not yet seen
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
      settings and entities with a live switch (built, not yet seen; pointer only so far).
      Keyboard wrap, Space to toggle, Escape and three new entries are built and not yet seen
- [x] Per-element appearance editor: fill layers, text, shape, accent, size; this element or
      every one of its kind; menu, shortcut and pick tool
- [~] Context menus on every element: the menu, its filter and shortcuts are in, with export,
      history and lock for the page the element is on, and a lock for the element itself;
      entries specific to what was clicked (entity, device, area, link) are built and not yet seen
- [~] Page tools in every page header: search this page, edit appearance, read aloud, history,
      export, lock and help, with a footer line on every page. Dashboards have the footer, the
      lock and the tools in the right-click menu, but no header cluster. Dialogs have their own
      row: search this dialog, edit appearance and lock
- [~] Locks and the unlock ladder: a whole page, a dialog or a single element can be locked,
      unlocked by a hold or a PIN, with growing waits after wrong PINs. Unlocking elements with
      the PIN is written but only the hold was exercised; the other rungs of the board's ladder
      are not built
- [x] Locks with their own credentials and the lock wizard: six ways in, QR code, countdown,
      list of locks. Seen in published build 131 on 12 November (wizard, locked screen, unlock, remove). Three
      layout defects found there are fixed in source and not yet seen
- [x] Two-key confirmation for destructive actions: every question marked destructive asks for
      two keys and a slide
- [~] Local version history: appearance, accessibility and open tabs, with undo, from every page
      that has the page tools. Not in dialogs; nothing kept on the server
- [~] Export from every page that has the page tools: CSV, JSON, Markdown, plain text, HTML and
      print; a tab-separated format and selected-rows-only are built and not yet seen. No
      spreadsheet or PDF file formats
- [~] Selection bar and bulk actions on every table. The bar is built on Notifications, Labels,
      Automations, Scripts, Tags, Dashboards, Resources, Scenes, Blueprints and Backups and not
      yet seen; the Resources preview cannot tell which dashboards use a resource. The other
      tables do not have it
- [~] Guided forms and per-control information buttons: the information buttons are built and not
      yet seen. The worked example and the practise control are built into the setting panel and
      not yet seen; no page supplies an example yet
- [~] Settings that explain themselves. Personal settings does and the information buttons exist
      (built, not yet seen); the General page now has an information button and a confirmed
      Reset on its eight settings (built, not yet seen); other pages do not
- [~] Resizable panels, collapsible filters and statistics: split panes and a resizable filter
      pane and the collapsible statistics strip are built and not yet seen. No page sets the
      strip's data yet
- [~] Notification centre and toasts: notifications are a page with a search and selection;
      30-day history with Undo, colours and filter by severity, and stacked toasts with action
      buttons are built and not yet seen
- [~] Progress where it started, recovery where it broke: the activity tray and the recovery card
      are built and not yet seen; update installs show real stages and a recovery card with
      actions and update rows in the tray (built, not seen); draft recovery is built for the
      template editor only (not seen)
- [x] Phone fixes seen in build 96 at 390 px: the Marketplace list scrolls with its group header
      pinned, the Personal settings preview scrolls away, the accessibility panel's rows no
      longer overlap. Not seen: the "+" text size button staying on one line (batch 19)
- [ ] Phone layout fixes of batch 21: the bottom navigation bar publishes its visible height so the
      editor save bar, the accessibility panel and the version picker sheet stop reserving room
      for it while it is hidden (the earlier blank strip), a group chip on the personal settings
      page no longer scrolls its title under the pinned chips, and accessibility panel buttons are
      at least 44 px. Fixed in source; not yet seen
- [x] Rows in the expanded menu are 48 px (collapsed rail 56 px) so the whole menu fits a phone
      screen. Built; not yet seen in a running build
      Seen in build 106 at 390 px wide (rows measured 48 px)
- [~] Activity has a permanent record: everything the Activity page shows is also written to a Git
      repository in the configuration folder, one folder of chunk files for each day, committed in
      batches and never purged, rewritten or squashed; a Permanent record page lists days, shows
      a day, searches and holds the Git remote settings. 124 server tests pass; run on a throwaway
      copy across two restarts and on the hosted instance (build 106), where it created its
      repository and first day file; the page was seen in build 106 at 390 px (status Recording,
      counts, one day). Not seen: searching, a long history, a push to a real remote. It can still
      lose entries (a power cut in the seconds before a flush, a real queue overflow, shutdown
      while the disk is failing) and it does not import entries from before it started
      (`docs/features/activity-record/README.md`)
- [~] Starting points for blank editors: built for an empty template editor, an empty dashboard
      sections view, an empty automation and an empty script (six each), not yet seen. Not built: other empty editors
- [x] Version and updated-at on the first screen
- [x] Free, with nothing to buy: the About page says so, and says the project is independent
- [ ] Link confirmation for a link that opens a page of the interface from outside. Seen in published build 131 on 12 November:
      nothing opens before the choice. The page also threw an error and its error log fetched a
      source file from an outside host; fixed in source (batch 40), not yet seen
- [ ] Not-found screen for unknown pages under Settings, and the starting, connection lost,
      no-access, loading and error screens. Built; not yet seen in a running build
- [x] Help links open a copy of the article inside the interface, with 40 articles and 1,392
      integration pages bundled (licence CC BY-NC-SA 4.0, with attribution). Seen in published build 131 on 12 November on
      five pages, with no request to another host. Open review findings are listed in `HANDOFF.md`
- [x] Nothing is sent out: analytics, crash reports and diagnostics are removed
- [ ] Problem log in a Git repository in the configuration folder, with private values removed.
      A forced error produced files and a commit in a running copy; the page that lists the
      problems is not yet seen

## Setup and first run

- [~] First-run setup: three steps, password strength, a preview of dates and units, a review
      step, no cloud restore or outside links, no outside map lookup without a button. Built; not
      yet seen in a running build (the Welcome screen was seen with the old items; the fix is
      unseen). The integrations step now has cards and a failure-safe state machine; built, not
      yet seen
- [~] Every setup wizard is a fully interactive setup (real controls for every value, live
      validation, a real test where the server can do one, a live summary, Back and Next, jump
      to a step, save and resume, skip for optional steps). Guided setup, lock wizard, Google
      setup and backup setup are built and not yet seen; guided setup now has a 14-day draft,
      jump rules and Save and close, built and not yet seen; the others are not confirmed
- [~] Guided setup for integrations without a setup screen: 223 of 240 get drawn fields and 17
      one checked YAML box; two were saved through the interface's connection. The wizard in the
      interface is not yet seen
- [~] Google one-time setup under Settings. Server status and a refused bad key were driven in a
      running copy. Enabling services with a real key, the client file, the sign-in and the
      status of connected Google integrations are not exercised; the Nest registration guidance
      is built (six-step checklist) and not yet seen
- [ ] Passkey sign-in beside the password, with add and remove on the profile. The server tests
      (143) pass in a running copy; the sign-in page and the card are not yet seen and no real
      authenticator has been used. Review findings are listed in `HANDOFF.md`
- [ ] Backups: encryption off by default, a stored key never replaced without asking. Built; not
      yet seen in a running build

## Language and voice

- [x] Language modes: English, Cantonese, both. Built for this project's own surfaces. Seen in published build 131 on 12 November
      at 1440, 390 and 320 px. Cantonese for other pages is not written
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
- [~] The paid cloud service is hidden in the interface without changing anyone's configuration
      (the server integration is unchanged): a voice pipeline already set to a cloud engine keeps
      showing it, a configured cloud backup location is hidden and kept, and the network form no
      longer saves a cloud address as a custom external URL. The voice assistants page was seen
      without cloud promotion in build 103; the pipeline, backup and network cases are not seen.
      It remains visible in a few places for someone who has it configured (an existing
      cloud-stored backup's location name, one entity filter)
- [ ] Cantonese for eight more blocks, with a test that keeps them complete. Built; not seen
- [x] Renaming the app and logo customization. Seen in published build 131 on 12 November (sidebar, tab title, reset;
      the web app manifest keeps the original name)
- [x] Dim sum surprise: card at start with a dish from the public catalogue, always-on switch that springs back, hidden in School mode. Seen in a development build with the draw forced; the busy-moment rules (dialog, unsaved changes, connection down, update, error screen) are unit-tested, not seen

## Appearance

- [~] Colour picker and translator: a Colour tab was seen; the appearance editor now has its own
      picker (built, not yet seen); a 48-colour named palette, nearest-name line, gamut chips
      and a rainbow hue strip are built in both pickers and not yet seen
- [~] Fonts and type scale. A fonts dialog is built and not yet seen; the type scale (ratio,
      base, per-step overrides, live preview) is built and unit-tested and not yet seen. Not
      built: sync through appearance-sync and Cantonese strings for the scale
- [~] Appearance editor for type: typeface, weight, italic, line height, letter spacing,
      capitals, alignment and maximum lines are built in the editor and not yet seen
- [ ] Appearance editor for fill and layers: picture layers, masks, blend, per-state layers

## Automations

- [x] Verify visual action dictionaries in published Core 429 and the speech and scene examples
      in the published browser demo.
- [x] Verify the interactive browser demo on the project page.
- [x] Verify the sample media picker, text insertion, all-actions toggle, and Repairs editor in
      the published browser demo.
- [x] Verify the published Core 431 image in an isolated browser, back up the existing Core,
      and apply the exact image through the full-mode Supervisor.
- [x] Verify the normal release and stable update feed for Core 431. First-party action metadata
      inventory is in `docs/features/automations/action-selector-coverage.md`.
- [x] Verify to-do item selection and execution and expanded dashboard fallback controls in
      the local browser build. The test data is synthetic.
- [ ] Verify camera and climate providers on representative hardware. Built demo checks
      selected an ONVIF preset and a shared Sensibo mode with synthetic metadata. The action
      coverage guide records where provider-supplied metadata is still needed.
- [ ] Verify dashboard resource upload, media saving and the phone layout on the released build.

- [x] Test buttons on every condition and every Choose option
- [x] The Choose step tests and runs one option, the default actions or the whole step; Run now
      for automations and scripts asks first. Seen in published build 131 on 12 November
- [x] A Git repository for each automation; every save is a commit
- [x] A master repository; one push commits every automation repository, then the master
- [x] History manager: every version, compare, test one, test many, run many
- [x] History manager: make live, export, Stop during a long test, a narrow screen. Seen in published build 131 on 12 November
      (Stop was pressed during a bulk test; no single long test could be made)
- [ ] Automation editor motion, enable switch, Check button and history strip. Built; not yet
      seen in a running build. Review findings are listed in `HANDOFF.md`
- [x] Script editor redrawn with a mode selector, Run now and See past runs. Seen in published build 131 on 12 November.
      Open: Save in a bottom bar
- [~] Named test cases, and a simulated run that pretends the actions. Built in the history manager
      (create, rename, duplicate, delete, simulate one or all, condition trace, would-run list; nothing is
      called); not yet seen in a running build
- [~] A dry run of a whole automation from the editor, and a bottom bar next to Save. Built; the visual
      and blueprint editors still draw their own save bar and Check strip, so two bars show there. Not yet seen
- [~] The repository page for one automation and the repository strip in the editor. Strip and Push action
      built (host shown only); pull and an unpushed count are not possible because the server has no such
      data. Not yet seen
- [ ] Remote settings and pull in the interface; a push to a real remote host checked
- [ ] Repositories for scripts and scenes
- [~] Backups carry every automation repository with its history, and a restore brings them
      back. Tests written (real Git commits, archive, extract, compare) but not yet run: this machine
      has no securetar. No exclude pattern touches the folder. Not proven with a real backup and restore
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
- [~] Dashboard history and automation history: a search field and a searchable version picker
      for Compare, and "Git remote" in full on the history and recorded problems pages. The
      dashboard history overview with its search field and plural forms was seen in build 103 at
      390 px; a tab's version count wrapped onto two lines there (fixed, not seen). The version
      picker was seen in build 106 at 390 px wide (opened, listed versions, a choice produced a
      compare)
- [~] One save bar in every automation, script and scene editor mode (a read-only automation no
      longer shows an enabled Save). Built, with hide-when-clean, Discard and live announcements; not yet seen. The blank strip when the phone's bottom
      bar hides on scroll is fixed in source (batch 21) and not seen

## Modern redesign, batches 41 to 54 (12 and 13 November 2026)

Design canvases 23 to 31. Details and the state of each feature are in
`docs/feature-status.md` and `docs/features/`.

- [~] Design foundation (kit colours, tertiary tone, container pairs, shadows, motion tokens,
      28 px cards). Viewed in published build 347 in light and dark at three widths with no page
      errors; dark contrast of the new tones, custom themes, high contrast and right to left
      still need a browser
- [~] Navigation pane as the default shell. Seen in published build 371 (role line, tools menu);
      docks other than left, collapsed pane, toggle off, right to left and both-languages mode are
      not seen
- [x] Floating tool pill with the page menu last, and one title block with a summary line on list
      pages. Seen in published build 371
- [ ] Large title and breadcrumb on dashboards beyond the segmented views row. Not built
- [ ] "Notifications" in the navigation pane sits off centre. Seen wrong in build 371, open
- [ ] The welcome banner is cut at the top edge on a wide home page. Seen wrong in build 371, open
- [ ] One page error (`this._layoutElement.setConfig is not a function`) once in 80 page loads
      on a built-in overview page. Not reproduced
- [ ] The Tags page shows two help icons. Seen, not fixed
- [x] Home greeting and the "Needs you" card. Seen in published build 371
- [ ] Lights, security, energy and climate page tops and number tiles on protocol pages. Built in
      batches 46 and 48; not yet seen
- [~] Phone shell: floating bar and card rows with round select marks seen in build 371; the More
      sheet, quick tools, touch picking and bottom sheets built in batches 48 and 49, not seen
- [ ] Phone pages: the grid and edit icons at the top and the greeting as the title. Not built
- [ ] The three discovery browsers as one page. Partly built: one tab strip, still three addresses
- [ ] Visibility conditions for views and dashboards, presentation roles, "Who can see this", a
      view-only level and default dashboards per kind of device. Built in batches 46 to 48; not
      yet seen
- [ ] Roles on tabs from a menu. Not built
- [ ] Automation tools (flow, trace, simulator, replay, conflicts, plain language, steps and locks,
      variables, blueprint maker, health, week ahead, entity swap, breakpoints, test cases with
      coverage). Built in batches 44 and 48; not yet seen. Step locks validate on the server
      (run on a throwaway instance)
- [ ] Dashboard editor tools (screens, layout and resize, visibility, interactions, style,
      simulator, inspector, accessibility scan, wall panel, card library, performance,
      checkpoints). Built in batches 44 and 48; not yet seen
- [ ] Free pixel layout, per-gesture animation and share as an extension for dashboards. Not built
- [ ] Pop-up cards, card styling, history compare, scenes edited on paper with Preview, raw editor
      Replace entity. Built in batches 47 and 48; not yet seen
- [x] Storage page with its ring, facts and biggest entities, and the 24-hour build stamp. Seen
      in build 401 (batch 50 fixes)
- [~] Per-entity storage view and recording rules. The server calls were run for real on a
      throwaway instance (batches 48, 49); the per-entity view and rules are not seen in the
      page. pytest for the new server code has not run on this machine
- [~] Motion editor. The page was seen in build 371; the effect on the seven components is built
      and not watched
- [ ] Help page, guidance notes, progress with recovery for app jobs, Extensions page with
      consent. Built in batch 48; not yet seen
- [ ] Resuming an app job part way. Not built (the Supervisor cannot)
- [ ] Enabling or disabling a dashboard resource from the Extensions page. Not built (no such field)
- [ ] Select by rule in every settings list. Built in batch 50; not yet seen
- [~] Add from a file (ZIP) in the Marketplace. The server endpoint was run for real on a
      throwaway instance (batch 51); the dialog is not seen and the refusal before the
      Marketplace warning is accepted is not confirmed
- [ ] Scan a tag. Built in batch 46; not yet seen and not tried with a real tag
- [ ] Pattern workbench additions (trace, dialect import, search in files, encodings). Built in
      batches 46 and 48; not yet seen
- [ ] Searching the instance's own configuration files from the pattern workbench. Not built: it
      needs a server call that reads files, an owner decision
- [ ] A lock on one appearance value and several pages locked at once. Built in batch 48; not yet seen
- [ ] Two-key confirmation with nothing to type on any device, wrapping confirmation titles,
      release notes with the update time, the session clock in 24-hour form (batch 52). Built,
      unit tested; not seen
- [ ] Automation editor fast mode, trigger groups (`editor_group`), Relationships, Simple,
      Advanced and YAML levels (batch 52). Built, unit tested; trigger group validation run on a
      throwaway instance; interface not seen
- [ ] "Add a step here" and the keys T, C and A in the automation editor (batch 54). Built, unit
      tested; not seen
- [ ] String builder for template text fields (batch 53). Built, 14 model tests; not seen
- [ ] Performance diagnostics and offline cache health (batch 52). Built, unit tested; not seen
- [ ] Select many cards, shared clipboard, duplicate, Dashboards card, swiping between
      dashboards (batch 52). Built, unit tested; not seen
- [ ] Light card sliders, energy colours, rainbow colour picker (batch 52). Energy colours run
      on a throwaway instance; cards not seen
- [ ] Wall tablet mode and the `wall_tablet` integration (batch 52). Server commands and
      services run on a throwaway instance; interface not seen
- [ ] Two-column setup forms with step chips, accessible entity picker, notes on devices and
      entities, the editor's shortcut list (batch 52). Built, unit tested; not seen
- [ ] Sidebar names and default pages, outside link choice, quick bar pins and recents, dark mode
      readability check (batch 52). Built, unit tested; not seen
- [ ] Web app manifest shortcuts (batch 52). Run for real: four shortcuts listed
- [ ] Phone home-screen widgets and car actions. Not built: they need the native phone apps,
      which are not in this repository
- [ ] A step total in setup forms, a per-field connection check, lazy loading switches. Not built
- [ ] The board's Ctrl Shift F row. Not built: the key was not rebound, so the row would not be
      true
- [ ] Multi-select in masonry views (sections views only so far). Open
- [ ] A Cantonese version of the string builder's text. Open
- [ ] The dark mode readability check on pages it can report but cannot fix. Open
- [ ] Wall tablet settings as their own page. Open
- [ ] A local production build that starts (it stays on the loading screen with no error, while
      published builds load). Not solved
- [ ] Observe the Docker engine restarting with the new proxy lookup setting (confirmed only by
      restarting the proxy)

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
- [~] Support tickets: the Support page has a Tickets section (create, list, status, search,
      notes, close and reopen); built, not yet seen in a running build
- [~] Authenticator and QR pairing: the authenticator card on the profile page is built and not
      yet seen; the code generator in Tools is not built (the browser has no credential vault);
      QR pairing is the lock wizard's QR step, already built and not yet seen
- [x] Changelog viewer: What changed, under Settings, About
- [x] Release notes page. Seen in published build 131 on 12 November
- [~] Offline help articles: the Help tool with 12 articles was seen; 40 articles and 1,392
      integration pages are bundled and not yet seen; no article per page yet
- [ ] Rendered provider text
- [~] File converter: data formats, images, text transforms, archives (ZIP, TAR, GZIP), pictures,
      text and Markdown to PDF, Word documents to and from text, audio to WAV and a still picture
      from a video are built, hardened against hostile files in batch 21 (unit tests), and the
      page was seen in build 103 (categories show Ready). The conversions themselves have not been
      run in a browser. Not offered: reading PDFs, MP3 output and video-to-video conversion
- [x] Base64 toolkit: encode, decode and data URLs for text and files, under Tools
- [~] Minecraft server manager: definitions, SSH hosts, version lookup, the Docker over SSH
      target (start, stop, log) and a server page with overview, logs, settings and removal tabs
      are built and covered by 217 server tests; on 11 November 2026 build 106 was run against a real
      SSH and Docker host in a throwaway container and the pages were seen; the Paper version
      list address, found retired there, was fixed in batch 24. On build 109, 26.3 could not
      start on the Java 21 image; the image now follows the game version, and in build 111 26.3,
      1.21.8, 1.20.1 and 1.16.5 all started through the manager on their own Java. Not built: the other four targets, backups, the world
      generator
- [~] Local Ollama suite: servers, models, pull with progress and Cancel, delete, unload, model
      details with the assistants that use a model, and a test chat that cannot control the home
      are built (88 server tests, fake streams); the page has never been run against a real
      Ollama server. The empty state was seen in build 103; the pages with a real server and the
      test chat are not seen. Not built: helpers
- [~] Support page with a local support bundle that is never sent anywhere. The page was seen in
      build 103 at 390 px; the bundle was not driven in a browser
- [ ] Media folders: create, rename, move and delete in the Manage dialog, and the "Add media"
      fix reported broken on an iPhone (fixed in source only), the image upload button and the
      filter field on every media folder. Built; 141 server tests pass. Batch 20 closed a defect where
      a folder named "." resolved to the media directory itself and a recursive delete could
      remove it (the tests failed 19 times against the old code; now refused), enforced the
      confirmed counts, stopped uploads and deletes following a linked directory out of the media
      folder and limited the Manage dialog to administrators. Media sources were seen in build
      103; in build 106 with a headless browser at 390 px wide "Add media" opened a file chooser, an
      upload was listed and a new folder was created; a real phone, rename, move and delete are
      not seen
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
- [x] ~~Companion phone app: setup problems the owner reported are not yet described or fixed~~
      Closed by the owner's decision: there is nothing left to fix. The app connected after a
      proxy fault was fixed
