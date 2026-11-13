# Handoff

## Visual dictionaries and browser demo, 13 November 2026

- The automation and script action editors use a visual dictionary for object fields and extra
  action data. Declared selectors keep their existing controls. Speech options use the selected
  engines and language, with manual entries available when the engine does not describe an option.
- The project page links to a browser-only Home Assistant demo with speech and scene automations.
  The demo uses synthetic entities and stores edits in the current browser.
- The frontend suite passed 7,726 tests with the same three Windows build-management failures seen
  at baseline. The final local build produced a complete Core image. An earlier dependency hash
  mismatch for `multidict==6.9.1` cleared on the final build.
- The phone navigation stays in view during scrolling. Accessibility tools stack at narrow
  widths, and the media manager offers a tap-to-save step for originals and archives on touch
  devices. The rebuilt preview kept the navigation at the same height during a 600 px scroll.
  Accessibility controls fit at 320, 360 and 390 px in the preview.
- Dashboard resources can accept a local JavaScript module or stylesheet after confirmation.
  The upload path passed authenticated create, same-file retry, authenticated fetch, and
  deletion on an isolated Core container with the candidate modules mounted.
- In the complete local image, the resource dialog uploaded a stylesheet that took effect in
  the browser. At an emulated phone width, the media manager saved an original PNG and a WAV
  byte-for-byte. A physical iPhone was not used.
- The published project page demo saved and restored a speech option and applied the sample
  reading scene. The full guides and wiki generated 117 routes, all read back on GitHub Pages.
- The published Core 429 image from `716b7274596ba0f7f0e1677b4bcf5de9fa0236d2` passed an isolated
  browser check of the dictionary and stylesheet upload. The live update completed at 19:56:38 UTC
  on 13 November 2026 and the Supervisor reported healthy. The appliance release and update feed
  have their own publication status in Release run `43488530533`.

## Follow-up editor and media changes, 13 November 2026

- The action form uses capability lists for compatible targets, includes a media picker for
  existing split playback fields, and gives calendar offsets and WiLight triggers dedicated
  controls. Manual event data uses the visual dictionary. Text pieces can be inserted at the
  caret, and the all-actions continue-on-error setting applies when adding steps.
- Repairs has a native visual form. Dashboard elements without a supplied editor or form use
  the existing configuration as the basis for a structured editor. The browser demo includes
  an editable Repairs card and synthetic media. Custom integrations can provide additional
  control metadata and may still need manual input.
- Media transfer and image conversion offer cancellation. Check the destination after a
  cancelled or timed-out transfer. A physical iPhone and arbitrary third-party integrations
  have not been verified.
- The published demo from `19c542b8f27b86e6bd7075cfca32984e9584c9f0` passed Repairs save and
  reload at 390 px, media selection and playback simulation, text insertion, and inheritance
  when adding an action. Build time was 20:54:10 UTC on 13 November 2026.
- A local Core build from that revision converted a JPEG to PNG, kept the original, saved the
  converted file, and let the user cancel a stalled media upload at a 390 px browser width.
  Verify the published Core image separately before applying a follow-up live update.

## Core 431 deployment and release recovery, 13 November 2026

- Core `2026.11.1.431` is live on the existing full-mode installation. Its start time was
  21:45:08 UTC. The LAN endpoint returned HTTP 200 and the Supervisor reported healthy.
- The running image matches published digest
  `sha256:f2303f8f2b43400e140fe8c71fbc70de354e8cd74d550d18827306cdea1aa546`
  from source `79d87a41ce2f30f65f1a517d969f0a994753ef5c`. Before deployment, an isolated
  browser verified Google text-to-speech Options, selected `wav`, saved and reloaded it,
  and read the value back from Core. It also verified a scene dictionary and a local stylesheet.
- Build 429 was manually published after its workflow received HTTP 403. The normal release
  has 25 verified downloads. Channel revision `c21f89e338de9467c8950462aa37a9d62b6cc133`
  advertises Core and operating system build 429. Build 431 is still assembling its operating
  system downloads in [Release run 43509018387](https://github.com/Ding-Ding-Projects/home-assistant-material/actions/runs/43509018387).
- The published demo uses the same source as Core 431. It verified the speech, media, manual
  event, and dashboard editors with sample data. All 120 documentation routes responded.
- The demo's later browser loader update, `9249faf8fcf5c442502fb47c1caf15f0024a0c05`, includes
  both supported bundle types. Published WebKit checks opened speech Options and verified fixed
  bottom navigation through both legacy and modern routes at phone width.
- A separate exact-image check on Core 431 verified JPEG-to-PNG conversion, preserved and
  downloaded the original, and cancelled an intercepted stalled upload. A synthetic light action
  also offered effects from the capable target when a basic light was selected alongside it.

Written 9 November 2026 and brought up to date on 11 November 2026 (after batches 18 to 23, the last of them commit `5fbf6d91b`) for whoever picks this up next.

## Batches 34 and 35, 12 November 2026 (late morning): read this first

- Batch 34 (`e163a99be`): the New tab catalog's page list sat in the right half of the panel
  because the strip's group pill rule shared a class name with the catalog sections. Fixed in
  source; not yet seen in a build.
- Batch 35: three tab leftovers, built and unit tested, not seen in a browser.
  - Both hide dialogs keep a short placeholder; the long field text is the supporting text below
    the field, which wraps, so both-languages mode no longer cuts it. How the wrapped text looks
    at 320 px has not been looked at.
  - The phone Pages sheet lists pages in the wide strip's order (a group sits where its first
    member is) by using the strip's own layout function.
  - The shared tab menu actions take the surface's store as a parameter. Section tabs reuse them
    for hide many, undo of a hide and remove from group. Pin, move, single hide and the menu
    element itself stay separate on purpose, because their behaviour differs.

- Batch 36: the media upload button let no Ogg file be chosen on an iPhone, because the file
  field was limited to media types and the phone greys out what it cannot play itself. The
  field now names no type, so every file can be chosen. A chosen file with no type gets one
  from its name (the server refuses an upload without a media type). Files that are not
  pictures, video or audio are refused in the interface before anything is sent, in one message
  that names them; the rest of the choice still uploads. Chosen pictures get the conversion
  dropped pictures already had. Audio and video are not converted. Unit tested only: not seen
  in a browser, and not tried on a phone.

- Batch 37: the Supervisor unit tests were run for the first time (Python 3.14, throwaway
  container). First run 4,030 passed, 34 failed, 75 errors, all from tests that still described
  the upstream product (a telemetry attribute that no longer exists, diagnostics forced off,
  image names, the version channel address). Tests were updated, no source under
  `supervisor/supervisor/` changed. After: 4,139 passed, 0 failed, 0 errors, 1 skipped.
- Release 2026.11.1.131 (batch 34) was opened in headless Edge on a throwaway instance at 1440
  and 390 px: every visited page loaded with no page error, and the New tab catalog's sections
  fill the panel width. The live instance was then moved to build 131 at about 11:07 am Toronto
  time (core 2026.11.1.131, Supervisor 2026.11.0.131, no unsupported or unhealthy reasons). The
  move recreates the container, and the address answered again without a restart of the front
  proxy, which is the first sign that the proxy's repeated name lookup works.

- Batch 38, Deploy Assistant on this Windows machine: `deploy-assistant\build.bat` was run for
  the first time. Packages installed, 21 of 21 tests passed and the window built, but the
  installer step produced nothing and the script ended with exit 1. Cause: this machine runs
  Node.js 26, where the unzip step used by the package install and by the packager ends early
  without an error, so the desktop runtime is never unpacked (the release build uses Node.js
  22). `build.bat` now checks for the unpacked runtime straight after the install and says
  which Node.js version to use. The installer and the packaged window are still unverified
  here. The built window was driven unpackaged and headless with every outside call blocked and
  nothing deployed: the welcome wizard, the Deploy page with its five targets, Instances,
  Settings, search, the pattern workbench, dark theme, Cantonese mode and a 360 px wide window
  were looked at. Defects seen and left for the design lane: Cantonese mode leaves the settings
  row labels in English; at 360 px the header logo is cut and the step bar loses its labels; a
  permanent horizontal scrollbar under the tab strip; the page can stay scrolled after the
  wizard closes; the "Run it" and "Articles" tabs did not open in the walk (not confirmed as a
  defect).
- Why the full-mode container was found Exited (128) on 12 November, from a read-only look at
  Docker Desktop's logs and the Windows event log: between about 2:51 and 3:07 am Toronto time
  the Docker virtual machine recorded about 95 out-of-memory kills, stopped answering at 3:16
  am, and Docker Desktop restarted uncleanly at 3:56 am. No Windows restart, sleep or update
  was involved. The most likely reason the container stayed down is a known, open engine defect
  (moby issue 54065, seen on the same engine version, 29.6.1): after an unclean engine exit a
  container can be marked as stopped by hand, and `restart: unless-stopped` then skips it. The
  number 128 itself could not be explained; the old container and its log no longer exist.
  Not changed: `restart: always` in `compose.full.yaml` would bring it back in that case, but a
  container stopped on purpose with `host.bat --stop` would then also return at the next engine
  start; a memory limit on the outer container or on the Docker virtual machine would stop one
  workload starving the rest. Both are the owner's decisions.

- Batch 39: the Repairs page showed "Unsupported installation method" above "This installation
  is supported". The Supervisor integration's start-up check raised that repair for every
  installation that is not the appliance operating system; it now raises it only when the
  Supervisor does not report its host as supported. Not seen in a running build.
- Viewing pass on published build 131, 12 November, three throwaway instances, headless Edge,
  pictures inspected. Seen working: every main tab strip menu action carried through and
  rechecked after a reload; settings section tab actions; "Search all tabs" naming the section;
  dark theme; right to left; Cantonese and both-languages modes; the phone bar and Pages sheet
  at 390 and 320 px; line and letter spacing; the wording file by upload and by drop with a
  made-up file (applies, celebration, reload, refusal of bad files, clear); locks and the lock
  wizard; link confirmation; the not-found page and the connection-lost toast; help articles
  inside the interface with no outside request; name and logo; the automation editor's search,
  nested search and entity filter; the Choose step; the history manager; the script editor;
  media folders and uploads; the release notes page; backups with encryption off by default;
  the problem log; dashboards (editable copy, export, dropped import); 14 tools pages.
  Not driven: sounds and the narrator (not hearable), the starting screen, the embedded page
  panel, a real backup, appearance masks and per-state layers (not built), outside-link
  confirmation, the dim sum reload count.
- Batch 40, fixes for what that pass found, unit tested only and not seen in a browser:
  - The link confirmation page threw an error (a focus call before the button had rendered),
    and the error log then fetched a source file from an outside host. Fixed, and the error log
    now refuses any address that is not this instance's own origin.
  - Locks: list rows stack in the narrow tool panel; the remove prompt stays inside the window;
    wizard step 2 scrolls above its buttons; the panel text agrees with the list. The School
    mode switch no longer shows on before the PIN is accepted (it never stored without one).
  - An appearance fill on a data table was hidden under the table's own surface. The two-key
    slider is no longer snapped back while a pointer is down on it; whether a drag failed for a
    person, and not only for the headless driver, is still not known. The in-page copy of Run
    now and Check in the automation editor is removed (the bottom bar has them). Trace page run
    title and picker; scroll room under the sticky search; the colour tool labels its two names.
  - Phone bar labels stack in both-languages mode at 320 px; the list footer clears the
    floating button on a phone; sidebar labels wrap with wider letter spacing; the accessibility
    panel fits; the New tab catalog uses the window height; the strip snaps at its edge;
    37 Cantonese strings (passkeys, guided setup, footer, preview).
  - Left open by those fixes: the heading weight choice reaches only the list page title (about
    55 other title rules hard-code their weight); the phone bar height published to pages is
    still a fixed 64 px in the main layout; the slim bar of open pages is hidden by design.

- Build 137 (batches 36 to 40) passed a browser pass at 1440, 390 and 320 px and the live
  full-mode instance was moved to it at about 3:31 pm Toronto time on 12 November: core
  2026.11.1.137, Supervisor 2026.11.0.137, healthy, supported.
- Owner decisions applied the same afternoon: `compose.full.yaml` now uses `restart: always`
  and a memory limit (6 GB unless `HA_MATERIAL_FULL_MEMORY` is set); the live instance was
  recreated with both and read back. `deploy-assistant\build.bat clean` was run with a portable
  Node.js 22.23.5 first on the path: exit 0, installer, `RELEASES` and the full package were
  made. The installer has not been run or installed here.
- Viewing pass on published build 137, throwaway instance with an empty media folder, headless
  Edge, pictures inspected. Seen working: the media upload button (inside the Manage dialog)
  has no type filter, uploads audio and pictures, uploads a `.ogg` whose browser type is
  empty, and refuses a text file and an archive in one dialog that names them; lock list rows
  stack; lock wizard step 2 scrolls above its buttons; an appearance fill shows on a data
  table (1440 px only); phone bar labels on two lines at 320 px in both-languages mode; the
  list footer clears the floating button at 390 px; one Run now and one Check in the
  automation editor; the close-by-text dialog's short placeholder with the hint below; the
  phone Pages sheet in the wide strip's order; the link confirmation page with no error and no
  request to another host; the New tab catalog using the window height.
  Defect found: the lock remove prompt opened from the page tool panel was drawn underneath
  it, because the tool panel is a popover in the top layer. Fixed in batch 41 (the prompt and
  the wizard now enter the top layer too); not seen.
  Not confirmed: the Repairs card fix on the live instance (needs the owner's session), and
  the upload picker on a real iPhone.
- Batch 41, first slice of design canvas `23-modern-remake`, unit tested only, not seen:
  - Navigation: a per-strip setting "One navigation pane", off by default, in the profile and
    synced. When on, on a wide window, the rail is hidden and the tab pane carries Pages and
    System headings, Developer tools, Settings, Notifications with a count, a search field at
    the top of a side pane, the person's name, and a home button on a top or bottom bar.
    Not built: with the pane on, sidebar edit mode, per-page hiding, the update badge on
    Settings and the Assist entry are out of view; the phone bar keeps Access where the board
    shows Settings; no layout was seen at runtime (offsets with the rail hidden, top, bottom
    and floating docks, right to left, both-languages mode).
  - Pages: settings home tiles on tinted icon containers in four tones and banners with an
    action pill; the automation editor's action bar floats as a rounded card (full width on a
    phone); automation history has one Commit button at every width and a success tint when
    nothing waits; the apps page is one centred message with two buttons.
    Not built: a tertiary tone, the inverted action bar, the keyboard hint on Save, a tonal
    button style, an illustrated empty state, card shadow on phone rows.
  The owner has asked the design tool for a full modern redesign; more canvases are expected.

- Batch 42, the foundation for the full modern redesign (canvases 23 to 27, style kit
  `design/source/modern2/kit.css`), unit tested only, not seen in a browser:
  - Default light and dark themes carry the kit's colours: window, page and card surfaces,
    two further surface tones, outline, text, a retuned primary scale, a new tertiary tone,
    and container pairs for primary, tertiary, warning, error and success. A custom primary
    colour and user themes still override through the same properties.
  - Soft card and overlay shadows; motion tokens (a spring and an ease curve, one entrance
    duration) that the system reduced-motion setting and the accessibility tool both switch
    off; heading weight 600 through a new title weight that the reading option still overrides.
  - Shared components: cards (28 px radius, soft shadow, short entrance), buttons (hover lift,
    press), the switch (52 by 32), dialogs, menus and their items, list items, chips, fields
    (16 px radius; compact outlined fields become pills) and data table rows.
  - Not done: the segmented control, the select field itself, per-row entrance animation
    (rows are virtualised), hover lift on cards.
  - Needs a browser, light and dark, 320 px and desktop, reduced motion on and off: dark
    contrast for error, success and the lighter primary; the shadow on every card including
    dashboards with nested cards; pages whose background is now a tint with white cards; the
    larger switch in forms and right to left; field labels at the new radius; menus; chips;
    custom themes and the primary colour picker; high-contrast mode.
  Next: one pass per canvas for the page-specific layouts (24 everyday, 25 settings,
  26 system and tools, 27 protocols and entity dialogs).

- Build 347 (batches 41 and 42 plus the problem detector and NFC unlock from another lane)
  was viewed on a throwaway instance in light and dark at 1440, 390 and 320 px: 14 pages, no
  page errors, no sideways overflow, colours and cards read well in both themes. The live
  full-mode instance was moved to it at about 7:49 pm Toronto time on 12 November: core
  2026.11.1.347, Supervisor 2026.11.0.347, healthy, supported.
  Defect seen: on a wide window the automation editor shows the new floating action bar
  over the older status bar and its own Save button, so Save appears twice. Not fixed yet.
  Owner feedback the same evening: the running interface still does not look like the
  boards. The gap is the shell: the boards show one side pane (brand, search, Pages, System,
  the person) as a floating card, the page in a second card with a breadcrumb, a large title,
  one summary line and a single floating tool pill; the build shows a rail, a top tab strip
  and a row of ten tool icons, and on a phone a square bottom bar with Access where the
  board has Settings. "One navigation pane" exists but is off by default.
- Batch 43: media browser header and the embedded page as cards (canvas 24).
- Batch 44, canvases 28, 29 and 30, unit tested only, nothing seen in a browser:
  - Automation editor, a new Tools entry in the editor menu (dialog on wide, bottom sheet on
    a phone) built from `frontend/src/panels/config/automation/tools/registry.ts`: flow view
    with minimap; trace list for stored runs; simulator on the existing dry run (time,
    weekday, zone, state and numeric conditions; others reported as "cannot tell"; never
    calls a service); conflict and loop detector (static, worded as possibilities); plain
    language (configuration to sentences; two sentence patterns to a draft); steps on and
    off; variable and template inspector with live previews; blueprint maker (copy YAML) and
    a snippet library kept per browser; health score with its formula on screen; week ahead
    for time and time pattern triggers; entity swap across automations with review and one
    save per automation.
    Not built: breakpoints that pause a live run (the server has no such mechanism), replay
    of a recorded day, coverage of test cases (no saved test cases exist), locks on steps.
  - Dashboard editor, new entries in the dashboard tools dialog
    (`dashboard-tools-dialog/registry.ts`, `editor/tools/`): four same-origin frames of the
    saved view side by side; grid columns and rows per card in sections views; the existing
    visibility editor per card; tap, hold and double tap actions; style properties cards
    really read, copy and paste of them, a theme per view; state simulator on a copy of the
    states in inert previews; entity inspector with swap; accessibility scan (contrast,
    target size, missing names, with "not judged" where it cannot tell; no Fix); wall panel
    (clock screensaver, view rotation, night dimming; per browser, off by default; started
    from `ha-panel-lovelace.ts`); card library with versions in frontend user data
    (`dashboard_card_library`); per-card redraw time; named checkpoints and a structural
    diff. The tools dialog itself was restyled; it is still a centred dialog, not a side
    panel or a sheet.
    Not built: free pixel layout, per-gesture animation, radius and shadow overrides,
    "phone friendly" warnings, share as an extension, first-draw and subscription counts.
  - Canvas 28 and 29 polish: PIN keypad, lock wizard cards, lock list and two-key control on
    container tokens; personal settings "at a glance" tiles; guided setup cards; a count
    line in the notification drawer; date range on release notes; a timeline rail in page
    history and in personal schedules; focus modes as cards; a token swatch grid in the fonts
    dialog; the wording drop zone outline.
    Not built or not compared: three-column pattern workbench, New tab filter chips, the
    typed-word-then-hold confirmation, the accessibility tools as tiles, the appearance
    editor as a tabbed page, a floating bulk action bar (needs the shared table layout),
    Ollama, Minecraft, editor and forge pages, the motion editor, guidance notes, the
    decisions boards of canvas 29.
  - The Cantonese source now covers `ui.problems.`; its test accepts a name English uses
    only to choose a plural form as optional in Cantonese.

- Batch 45, the shell brought to the modern boards after the owner's feedback, unit tested
  only, nothing seen in a browser:
  - Wide: "One navigation pane" is on unless someone chose off (the stored shape now keeps
    both answers). The left pane is a floating card (brand and instance name, pill search,
    Pages rows with a tonal pill on the open page, a New tab row, System with count badges,
    the person and the Assist microphone, an Edit sidebar button) beside the page as a second
    rounded card; 248 px wide, 72 px collapsed.
    A fresh browser landed on the top edge because empty saved lists counted as an earlier
    version; only real saved tabs count now. Earlier builds also wrote "top" for existing
    installations without anyone choosing it, so once per browser a stored "top" returns to
    the default left pane (`pageTabsDockSidePane` marks that it ran); a later choice of the
    top edge is kept.
  - Page top on wide windows: one floating tool pill (the page's first action, search,
    appearance, history, share, lock, a divider, help, the page's menu). "Search this page"
    is a magnifier that opens the field in a small card with Read aloud. On a dashboard, Add,
    Search and Assistant moved into the three-dot menu. Larger titles on settings pages.
    Not built: a large title and breadcrumb on dashboards (that row is the view tabs).
  - Automation editor: one floating bar and one Save, with the status text and the Ctrl S
    hint; the older save bar is no longer drawn there or in the blueprint editor. The script
    editor was not checked for the same doubling.
  - Phone: a floating pill bottom bar with Home, Search, Pages, Settings, Menu and a tonal
    pill on the active item; Settings carries the updates plus repairs count; accessibility
    tools are the first row of the Menu drawer; the extra hamburger at the top of pages is
    hidden on a phone; the Pages sheet is one rounded card of rows.
    Not built: the grid and edit icons at the top of phone pages, greeting as the title.
  - Needs a browser before the live instance moves: fresh and existing browsers both get the
    left pane; no page under the pane; collapsed pane; the toggle off; top, bottom, right and
    floating docks; the tool pill on settings, dashboard and table pages; the search card;
    the automation editor bar; the phone bar over long pages and sticky bars at 390 and
    320 px in both-languages mode; dark theme; right to left.

- Build 348 (batch 45, the shell) was viewed on a throwaway instance at 1440 and 390 px, no
  page errors. Seen working: the floating tool pill on settings sub-pages and the automation
  editor; one bar and one Save in the automation editor with the shortcut hint; the floating
  pill bottom bar on a phone with Settings and its count; tinted settings home.
  Seen wrong, so the live instance stays on 347: (1) the navigation pane still sits at the
  top. The one-time reset ran, but the instance sync then brought the old stored "top" back
  from the server. (2) On the home dashboard the greeting is cut off under the welcome
  banner. (3) In the tool pill the page's own menu comes first where the board has it last.
- Batch 46, unit tested only, nothing seen in a browser:
  - The edge of the navigation pane is stored under a new key (`pageTabsEdge`), and nothing
    writes "top" by itself any more, so every browser starts with the left side pane and only
    an edge a person chooses afterwards is kept and synced. An edge chosen earlier (right,
    bottom, floating, top) has to be chosen once more. This replaces the one-time reset of
    batch 45.
  - Time of day defaults to the 24-hour form when a person has not chosen a format.
  - New tag dialog: a "Scan a tag" button. It listens on this device's reader where the
    browser has one (Chrome on Android over a secure address) and for a scan with the Home
    Assistant app. A tag read here fills the ID; a scan with the app is added by Home
    Assistant itself, and the dialog says so. Safari and Chrome on an iPhone have no reader
    for web pages; the dialog says that too.
  - Views: the Visibility tab gains "Show only when", the same condition builder cards use
    (state, number, time, screen, user, location, with And, Or and Not groups), evaluated by
    the server-backed evaluator. A view whose conditions fail leaves the navigation, except
    while editing. It still opens by its address.
  - Dashboards: the same builder in the dashboard's settings dialog (administrators only).
    Conditions are kept in the shared frontend settings (`dashboard_visibility`), not in the
    core dashboard record. A dashboard whose conditions fail leaves the sidebar, the
    navigation pane, the tab strip, the phone Pages sheet and the New tab catalog; the
    default dashboard and the one in use are never removed; the settings list always shows
    it with a "Hidden right now" note. Evaluated in the browser only (conditions only the
    server can judge are not supported here yet).
  - Dashboard top on wide windows: breadcrumb, large title, views as a segmented control,
    edit mode on the same layout; the header scrolls with the page. Phone tops: larger title,
    page tools and edit moved into the three-dot menu on dashboards, a magnifier in place of
    the grid elsewhere.
  - Entity dialog: tinted icon tile, title and a state line; Controls, History and Settings
    chips at the foot.
  - Home "Needs you" card (unlocked locks, pending updates); lights, security, energy and
    climate page headers and a Locks list; six boxes for a one-time code at sign in; Assist
    bubbles; empty states; first-run buttons.
  - Lists: a floating bulk action bar on devices and entities; tags as cards with a switch
    to the list; an integrations "Discovered" hero; a warning when an entity ID in use is
    renamed; restart choices and repairs with tinted icon tiles.
  - Accessibility tools as tiles; pattern workbench in three columns on wide windows; New
    tab catalog filter chips; a "type the word, then hold" confirmation on touch screens;
    appearance editor tabs; the last two browser alert boxes replaced.
  - Fixes: two example sentences in the plain-language tool were written with angle
    brackets, which the message format reads as a broken tag; four new files used plain
    browser inputs and now use the product's controls (both were test failures that batch 44
    shipped because its test run was too narrow: the full suite is run before every push
    from now on).
  - Checks: full suite 7,153 passed; failing are the 3 known build-script tests and one help
    bundle test that timed out under load and passes alone. Type check clean apart from the
    two known gallery errors.
  - A local production build mounted into a throwaway container stayed on the loading screen
    with no error, while published build 348 of the same source loads; local builds on this
    machine are not a usable preview.
  - Design canvas `31-modern-requests` landed during this batch and is not built yet.

- Batch 47, unit tested only, nothing seen in a browser. Pushed while the build of batch 46
  was 20 minutes in, so that build is replaced by one that carries both.
  - Fixes for build 348: the welcome banner on the home page is part of the page flow on
    wide windows, so the greeting is no longer covered (a phone keeps the fixed banner); the
    page's own menu comes last in the tool pill (`src/layouts/tool-pill-order.ts`, tested);
    one title block on list pages, with the count line under the header title; the avatar in
    the tab strip is readable in the dark theme. Seen and not fixed: the Tags page shows two
    help icons.
  - Canvas 31 (community requests):
    - Scenes: editing changes the stored states only and calls no service; Preview asks,
      applies for 30 seconds and restores from a snapshot scene, with "Go back now"; the
      dialog says what cannot be restored exactly. Live Edit and Try it are unchanged.
    - Raw configuration editor: Go to line, a status bar (line, column, valid or not, match
      count) and a Replace entity panel with whole-ID matching and a preview. The find panel
      is still the code editor's own.
    - Automation rows: each trigger and condition shows its entity's state; conditions say
      whether they pass now, using the existing condition test call, throttled.
    - Storage: a History database card from what the recorder reports. Not built: database
      size, growth, per-entity size and savings (the recorder has no call for them).
    - Card styling without an add-on: a Style tab in the card editor (text size and colour,
      icon colour, background, border, corner radius), validated as lengths and colours and
      applied as custom properties on the card host. Not built: padding.
    - "Open a pop-up" as a tap, hold or double-tap action, with a card list editor; three
      levels deep at most.
    - History graph: fixed axis limits and a colour per entity already existed; comparing
      with an earlier period is not built (the chart has no second dashed series).
    - Default dashboards: one for everyone and optional overrides for phone, tablet, desktop
      and wall panel (`default_panel_overrides` in the shared frontend settings); a person's
      own choice still wins.
    - Presentation roles: a Roles page beside People, a `role` condition evaluated in the
      browser and never sent to the server, Show or Hide per dashboard, and "Who can see
      this" on a card in edit mode. The interface says roles change what is shown and are not
      access control. Not built: a "view only" level, roles on tabs from a menu.
    - Room-first layouts: the existing areas strategy already does this; nothing added.
  - Checks: full suite 7,208 passed with the 3 known build-script failures; type check clean
    apart from the two known gallery errors.

- Batch 48, the owner's "build all": the boards earlier batches had left unbuilt, built for
  real, with new server calls where a number or a pause did not exist. Unit tested; nothing
  seen in a browser except the server calls, which were run for real (below).
  - Server (`core/`): `recorder/storage/overview` and `recorder/storage/entity`
    (`components/recorder/storage_usage.py`, administrators only, in the recorder executor,
    bounded), and `editor_locked` accepted and dropped on automation steps in
    `helpers/config_validation.py`. The pytest files could not run on this machine (the
    Python here lacks the product's packages), so the three changed files were mounted into
    a throwaway container of build 348 and called over the websocket: the instance starts,
    the overview returns the SQLite file size, table size, 14 days of growth and the biggest
    entities, the entity call returns rows per day and the keep days, a limit of 9999 is
    refused, and steps carrying `editor_locked` validate.
  - Storage page: ring with the measured database size, growth chart, biggest entities, and
    a per-entity view with an estimated saving before a purge behind a typed confirmation.
    Not built: switching recording off for one entity or limiting how often it records (the
    recorder's filter is start-up configuration; no call changes it while running).
  - Automation tools: live breakpoints with Step, Continue and Stop through the server's
    existing trace debugging commands; saved test cases with a coverage map; replay of a
    recorded day from real history; locks on steps; a flow node jumps to its step; more
    sentence patterns.
  - Motion: an "Animation and transitions" page under Personal settings (profiles, master
    switch, speed, nine element kinds, a curve editor, live preview). Reduced motion always
    wins. Seven shared components read a timing token with their old timing as the fallback.
  - Help page for the offline bundle; a guidance note in integration setup dialogs; progress
    with the failed step, Start again and Copy details for app jobs; an Extensions page for
    dashboard resources and custom panels with recorded consent. Not built: resuming an app
    job part way (the Supervisor cannot), enabling or disabling a resource (no such field).
  - Dashboards: drag to resize in sections, "Make phone friendly", a view-only level for
    presentation roles, history compare with an earlier period, tap feedback, padding and
    shadow in the Style tab, first-draw time, card files, a Cameras section, an energy Cost
    tile.
  - Phone: quick tools in the Pages sheet, pages as a card grid, picking an element by
    touch, the tool panel and workbench as bottom sheets, a lock on one appearance value,
    several pages locked at once. Workbench: a step trace of its own, Python and PCRE
    import, search in files picked from the device, encodings.
    Not built: tables as cards and a folding tool pill on a phone (shared table and layout
    parts, left for a next round); searching the instance's own configuration files (needs a
    server call that reads files, a security decision for the owner).
  - Entity dialogs show the state once; timer with labelled buttons and +5 minutes; counter,
    person; number tiles on the protocol pages from real data, MQTT rates measured by the
    page after Listen; one assistant's pipeline strip with a real last-run time. Not built:
    analytics switches (analytics is deliberately a no-op in this product).
  - Shell and everyday: role line and a tools menu in the pane, segmented control and select
    to the kit, a summary line under settings titles (check for pages that now show two),
    home greeting line and "Needs you" with repairs and open doors, big-number and lit
    tiles, loading, not-found and error screens, the "preparing" page
    (`frontend/landing-page/`).
  - Checks: full suite 7,362 passed; the 3 known build-script failures and the help bundle
    test that times out under load and passes alone (42 of 42). Type check clean apart from
    the two known gallery errors.

- Batch 49, the last two pieces of "build all". Unit tested; the server part was run for
  real, the interface was not seen in a browser.
  - Recording per entity: `recorder/entity_options/set` (administrators only) with
    `recording_disabled`, `min_interval` (0 to 3600 seconds) and `always_on_change`, kept in
    `.storage/recorder.entity_options` and applied at once. The recorder consults an
    in-memory rule set (`components/recorder/entity_rules.py`) beside the YAML filter, which
    stays authoritative. With an interval, a repeat of the same value inside the interval is
    dropped; a change to a different value is recorded at once unless `always_on_change` is
    off. The storage entity view has a "Keep history" switch and "Record at most once
    every…" with the estimated saving shown first.
    Run for real: the changed recorder files were mounted into a throwaway container of
    build 348 and driven with two test sensors. Switched off, a sensor stopped gaining rows
    while the other kept gaining; switched on, it gained again; with a 60 second interval two
    repeats of the same value added no row and a new value added one; 3601 seconds was
    refused; the storage file was written. (The recorder commits every 5 seconds: a probe has
    to wait longer than that before counting rows.) pytest still cannot run on this machine.
  - Phone: the page tools fold into one "More" sheet on pages without a menu of their own,
    with a lock icon kept visible on a locked page; the selection bar on a phone is a light
    sheet above the phone bar; round select marks on card rows (tables already drew rows as
    cards on a phone); the three discovery browsers share one tab strip and
    `/config/discovery` leads to the first of them.
    Partly: the three discovery browsers are still three addresses, not one page.
  - Checks: full suite 7,372 passed with the 3 known build-script failures; type check clean
    apart from the two known gallery errors.
  - Open, for the owner's decision: searching the instance's own configuration files from
    the pattern workbench needs a server call that reads files; not added.

- 13 November, live moves. A release run publishes the container images about 25 minutes
  after it starts; the Raspberry Pi and virtual machine images take the rest of the two
  hours. A browser pass can therefore start as soon as the "Publish the container image" job
  ends (the tag is the newest one on the container package). Two runs were cancelled after
  their container images were out so the next run could start; builds 368 and 371 therefore
  have container images but no operating system images and no release page.
  - Build 368 (batch 46): wide light pass, then live at 00:27 Toronto time. A fresh browser
    gets the left navigation pane; 24-hour time is the default.
  - Build 371 (batches 47 to 49): 80 pictures (24 pages, light and dark, wide and phone), no
    sideways overflow; live at 01:02 Toronto time. Seen right: the greeting and the "Needs
    you" card, the pane's role line and tools menu, the page menu last in the tool pill, one
    title block with a summary on Devices, the motion editor, the floating phone bar, card
    rows with round select marks.
    Seen wrong: the storage overview said it could not be read (fixed in batch 50); the build
    stamp still used the 12-hour clock (fixed in batch 50); "Notifications" in the pane sits
    off-centre; the welcome banner is cut at the top edge on a wide home page; one page error
    (`this._layoutElement.setConfig is not a function`) once in 80 page loads on a built-in
    overview page, not reproduced on the other passes.
  - The owner's phone showed the detector badge in plain English: the wording in that
    browser was an older import. The wording file itself is maintained outside this
    repository and has to be imported again.
  - Local production builds mounted into the container still stay on the loading screen
    (the application chunk loads, defines 31 elements and stops at an asynchronous locale
    data chunk, with no error). Published builds of the same source load. Not solved.
- Batch 50: "Select by rule" in every settings list (unit tested, not seen); the storage
  overview loads on its first update instead of on connect; build stamps in 24-hour form;
  five README pictures from build 371.

- Build 401 (batch 50) was viewed (wide light and phone dark, no page errors): the storage
  page now draws its ring, facts and biggest entities, and the build stamp is in 24-hour
  form. Live at 01:42 Toronto time, 13 November: core 2026.11.1.401, healthy, supported.
- Batch 52, the second half of design canvas 31 and the owner's requests of the night. Unit
  tested; the server parts run for real on a throwaway instance; the interface not seen.
  - Owner's correction: the two-key confirmation is the two keys and the slider on every
    device, with nothing to type; the typed-word form from batch 48 is out of use. Titles of
    confirmation dialogs wrap. The session clock chip is in 24-hour form. Release notes now
    carry an "Updated:" line with the Toronto time and UTC.
  - Automation editor: fast mode (a collapsed branch no longer builds its children; long
    lists draw 40 rows at a time; a synthetic 530-row configuration builds 5 rows with its
    branches closed), trigger groups (`editor_group`, accepted and dropped by the server),
    a Relationships tool and "From …" chips, and Simple, Advanced and YAML levels.
  - Performance: Settings, System, Performance with real timings and a Fix where a stored
    dashboard can change; an offline cache page with counted stalls and a reset.
  - Dashboard editing: select many cards (sections views), a clipboard shared between tabs,
    duplicate a view or a dashboard, a Dashboards card, swiping between dashboards on a phone.
  - Cards: sliders on the light card, energy colours per source and device (`colors` in the
    energy preferences), the rainbow that opens the full colour picker.
  - Wall tablets: a wall tablet mode (burn-in drift, lockdown with a PIN exit, wake on
    motion, an opt-in wake lock) and a new server integration `wall_tablet` (announce, list,
    command, forget; services wake, sleep, reload, navigate) in the default set.
    Not built: home-screen widgets and car actions (the native phone apps are not here).
  - Setup forms in two columns with step chips; an accessible entity picker (six defects);
    notes on devices and entities (shared frontend settings, key `registry_notes`); the list
    of an editor's own key bindings.
  - Customisation: rename sidebar entries and default pages, how outside links open, a quick
    bar with pins and recents, a dark mode readability check.
  - Run for real on build 401 with the changed server files mounted: the instance starts
    with `wall_tablet` loaded and its four services; list, command and forget answer; a path
    starting with two slashes is refused; energy colours save, read back and clear, and a
    value that is not a colour is refused; a trigger carrying `editor_group` validates; the
    web app manifest lists four shortcuts.
    Found by that run and fixed before the push: the navigate service was registered
    without its first argument, so the integration's set-up failed and none of its websocket
    commands existed. `py_compile` had passed.
  - Checks: full suite 7,614 passed with the 3 known build-script failures; type check clean
    apart from the two known gallery errors and a string builder still being written, which
    is not part of this commit.

- Batch 53: a string builder for text fields that accept a template (a "Build text" button
  on action text fields and on the template editor; pieces for text, entity state and
  attribute, name or area, date and time, time since or until, numbers, comparisons, counts
  and raw template; live server preview; round trip). 14 model tests; not seen in a browser.
  The design lane's "Add trigger, condition and action at the top" was merged with it.
- Batch 54, the rest of design board RAutoAdd, unit tested, not seen: an "Add a step here"
  control between any two steps that inserts at that position (root and nested lists; joins
  a trigger group when placed inside one; respects fast mode and folded groups), and the
  keys T, C and A in the visual automation editor (not in fields or dialogs, and only when
  keyboard shortcuts are on). Ctrl Shift F was not rebound; the board's fourth row would not
  be true. Checks: full suite 7,629 passed with the 3 known build-script failures; type
  check clean apart from the two known gallery errors.
- Closeout of 13 November: `main` is the only branch locally and on the remote, there is one
  checkout and no stash. The release run for the commit that carries batch 54 is the one
  left to finish completely (container images and operating system images), so it produces
  the release page; earlier runs of the night were cancelled after their container images
  were out.

- Build 2026.11.1.413 (commit `9a36a2146`, batches 43 to 54) was looked at in a browser on
  13 November as the published image run as it is: 100 captures over 29 pages, light and
  dark, wide and phone, with no sideways overflow. Seen right: add a trigger, condition or
  action at the top of the automation editor with the Simple, Advanced and YAML switch, the
  single floating save bar, the performance page, the home greeting with its "Needs you"
  card, the navigation pane with the Owner line, the storage ring, and the 24-hour build
  stamp. The live instance was moved to it at 02:46 Toronto time and read back as core
  2026.11.1.413, healthy and supported, answering on the LAN address.
- Open faults seen on build 413, not fixed: a page error on the built-in overview page in
  three of four passes, `this._layoutElement.setConfig is not a function` (the reuse path in
  `frontend/src/panels/lovelace/sections/hui-section.ts` and `views/hui-view.ts` calls
  `setConfig` on an element that may not be upgraded yet; a guard that waits for the element
  definition is the likely fix); the welcome banner is cut at the top edge on the wide home
  page; "Notifications" sits off-centre in the navigation pane.
- README pictures: seven are from build 413 (home, settings home, System, home on a phone,
  the automation editor, storage, performance). The animation page keeps its build 371
  picture because the newer capture had a food toast over it.

- Release `v2026.11.1.413` was read back on 13 November: the workflow run for commit
  `9a36a2146` ended in success, the release is not a draft and not a prerelease, it targets
  that commit, it carries 25 files (operating system images for ova, rpi3-64, rpi4-64 and
  rpi5-64 with their checksum files, the frontend wheel, the Deploy Assistant packages and
  `stable.json`), and its notes carry the line "Updated: 13 November 2026 at 04:03 EST,
  which is 2026-11-13 09:03 UTC." Nothing from it was downloaded or installed here; the
  operating system images of this build have not been booted.
- Final inventory of 13 November: `main` is the only branch locally, there is one checkout
  and no stash, so the closeout had nothing to delete. Correction to the earlier closeout
  line: the remote has a second branch, `channel`. The release workflow writes the update
  channel file (`stable.json`) to it and reads the last build number from it, so it must
  stay.

- Batches 55 to 57 (13 November), builds 2026.11.1.418, 419 and 420. Four passes used the
  published images for real on throwaway instances (generated test accounts, sample helpers,
  automations, scenes, dashboards, labels), feature by feature, with a capture looked at for
  every verdict. The live instance moved to 418 at 04:50, 419 at 05:34 and 420 at 06:30
  Toronto time, each after a browser pass on that exact image with no page errors.
  - Seen working in a published build: the navigation pane and its docks, the tool pill, the
    automation editor bar, keys T, C and A (and ignored while typing), "Add a step here",
    the string builder (wide, phone, the template page of the tools; live preview and round
    trip), select by rule with text rules and label rules, add from a ZIP (also a theme name
    with spaces), visibility by state for views (Or and Not groups, real state flips) and
    for dashboards (two And conditions), "Scan a tag" with its honest message, storage
    (overview, per entity, keep history off surviving a reload, purge queued), performance,
    wall tablets (announce and list), energy colours saved on the server, roles hiding a
    dashboard, scene preview and its return, the automation tools (flow, health, last runs,
    simulator run, a test added and passed, steps turned off surviving a reload, week
    ahead), the dashboard tools, dark theme on six surfaces, and a phone pass with no
    sideways overflow.
  - Confirmations: storage purge, deleting an automation, a scene, a label, a dashboard and a
    helper all ask for the two keys and the slider and have no field to type in. A slide
    without the keys does nothing. Batch 57 removed the typed-name step the dialog still had.
  - Faults found by those passes and fixed, each seen right afterwards in build 419 or 420:
    the overview page error, the welcome banner cut on wide windows, "Notifications"
    off-centre, the blank "Week ahead" tool, doubled titles on People, Roles and Tags, the
    empty type column on the dashboards list, two help icons, the stray breadcrumb
    separator, the selection pill over the bulk bar, the string builder subtitle on a
    phone, the empty block in the wall tablet card, two colour names, black named as a
    teal, the raw editor status bar below the window, the save bar under the open side
    pane, names wrapping in the energy colours card, the tools dialog jumping between tabs.
  - Still open, seen and not fixed: in the string builder the note "kept as one template
    piece" stays after the template piece is removed; on a phone the builder sheet leaves an
    empty strip under its buttons; with the automation side pane open the sticky search card
    covers the first action row when scrolled; the list of pages in the pane changed order
    between two runs (not traced); the save bar's room beside the side pane is measured
    left-to-right only. A time trigger at 22:00 reads 17:00 in the row when the instance is
    in UTC and the browser five hours behind; that is the time-zone display of the original
    project.
  - Still not seen in any published build: history compare, "Open a pop-up" tap action,
    "Save to my cards", checkpoints, breakpoints, "Replay a day", "Make phone friendly",
    cameras and the energy cost tile, right-to-left, both-languages mode, 320 px width, the
    offline cache counters (no service worker in the test browser), a real tag reader, and
    the update line in release notes inside the app (no update was on offer).
  - Runs for builds 418 and 419 were stopped once their container images were out, so they
    have no release page; build 420 is the one left to finish.

- Release `v2026.11.1.420` was read back on 13 November: its workflow run ended in success,
  it is not a draft and not a prerelease, it targets commit `d26f8c47a`, it carries 25
  files, and its notes say "Updated: 13 November 2026 at 07:45 EST, which is 2026-11-13
  12:45 UTC."
- Batch 58, build 2026.11.1.422: the four small faults listed as open above are fixed in
  source (the string builder note, the strip under the phone builder's buttons, a step
  landing under the sticky search card, and the unstable default order of pages in the
  pane). The browser pass on the published image had no page errors and no sideways
  overflow in light and dark, wide and phone, and the live instance moved to it at 08:25
  Toronto time. The four fixes themselves were not looked at one by one in that build.

- Closeout of 13 November, 11:00 Toronto time. READ THIS FIRST.
  - Live: the instance on the home network runs build 2026.11.1.425 (commit `f7f282a80`, batch
    60) since 11:00 Toronto time; read back healthy and supported, answering on the LAN.
    The browser pass on that exact image had no page errors and no sideways overflow in
    light and dark, wide and phone (92 captures).
  - Release `v2026.11.1.422` was read back: not a draft, not a prerelease, 25 files,
    "Updated: 13 November 2026 at 09:54 EST". The release run for build 425 was still
    building its operating system images at closeout and has NOT been read back. Builds
    418, 419 and 424 have no release page (their runs were stopped once the container
    image was out).
  - Batch 59 (commit `0de76e7bd`): visual faults found by looking at all 88 captures of
    build 422. Batch 60 (commit `f7f282a80`): automatic updates (new server integration
    `auto_update`, run for real on a throwaway instance; card and row switches on the
    Updates page), a "Continue on error for all actions" switch in the automation and
    script editors, a visual editor for dictionary fields with a Visual / YAML switch, the
    automation editor bar as a real footer, the automation tools sheet on a phone, the
    session clock in its own row on a phone, end fades on tab strips.
  - Seen in build 425 by looking at captures: the "Automatic updates" card with both
    switches on a phone, the automation bar as a footer with nothing under it, the count
    badge on the pane's overflow button, the person's name as plain text, the phone storage
    cards inside the screen. NOT yet looked at in a published build: the row switches of
    automatic updates and an automatic install through the page, the continue-on-error
    switch, the visual dictionary editor, the tools sheet on a phone, the empty states of
    Lights, Climate and Security, the dark theme outlines, the table toolbar wrapping, the
    clock row on a phone, the four fixes of batch 58. Nobody has yet used the batch 59 and
    60 features in a browser the way batches 41 to 57 were used.
  - Batch 61 (commit `86235d86f`) is UNFINISHED and saved so it is not lost: "known
    options" for dictionary fields. In it: a server command `tts/engine/options` (compiles,
    test written, never run against a server), a frontend model
    (`frontend/src/common/object-editor/known-options.ts`), a loader
    (`frontend/src/data/known-options.ts`) and a catalogue with the five confirmed
    `tts.speak` option keys. Missing: unit tests; passing the action, field and language
    from `ha-service-control` through `ha-selector-object` to `ha-object-editor`; the
    "Known options" chips, specific controls and the "not declared" note; the strings under
    `ui.components.object-editor`; a real run of the server command on a throwaway instance
    with the changed file mounted. Nothing in the interface uses it yet. The build of this
    commit must get its browser pass before the live instance moves to it.
  - Next steps, in order: read back the build 425 release; give the build of batch 61 its
    browser pass; use the batch 59 and 60 features for real on a throwaway instance and fix
    what is wrong; finish batch 61; then the features never seen in any build (history
    compare, the pop-up tap action, "Save to my cards", checkpoints, breakpoints, "Replay a
    day", "Make phone friendly", cameras and the energy cost tile, right-to-left,
    both-languages mode, 320 px width); refresh the README pictures from the final build.
  - Inventory: `main` is the only branch locally; the remote has `main` and `channel` (the
    release workflow needs `channel`); one checkout; no stash; no throwaway containers left.
    Nothing was deleted.

The Docker engine restarted again at about 10:29 am Toronto time. This time the full-mode
container came back by itself, but the address did not answer for about ten minutes. Cause: the
local front proxy (a small nginx container outside this repository that forwards port 8123 to
the full-mode container) looked the container's name up once at start and kept the old address
after the container came back on another one. The proxy now looks the name up again every few
seconds. That was confirmed by a restart of the proxy only (page 200, websocket upgrade 101);
an engine restart with the new setting has not been seen. The earlier exit (128) on 12 November
is still unexplained.

## Batches 31 to 33, 12 November 2026 (morning): read this first

Commits `6330c10d9`, `875b30677` and `8a37d4c04`, published together as release 2026.11.1.130.

- Batch 31 closed the gaps left by the first tab pass (the "Close other tabs" preview lists what
  stays and why, grouped tabs move inside their group, the menu key opens one menu, search fields
  take focus) and added a "Tab strip position" row to Profile.
- Batch 32: a settings page or a tool chosen in the New tab catalog opens as a tab of its own.
  Settings section tabs have their own right-click menu with groups, looks, locks and hide by
  text; the phone Pages sheet has locks, groups and looks.
- Batch 33: fixes from a browser pass on batch 32 in a local build at 1440, 1000, 390 and 320 px
  (most settings pages had no section tab menu; a chosen text colour did not show; lifting a
  finger after a long press ran the menu row under it; phone sheets stopped short of the edge).

Seen in the published build 130 on a throwaway instance with headless Edge, at 1440 and 390 px:
every visited page loaded with no page error; a settings destination shows as a tab in the strip;
right-click on a section tab opens the section tab menu (pin, hide, groups, move, look, lock);
the New tab catalog opens; the phone bar, the section tabs above it and the Pages sheet show.
The startup dim sum card appeared with a picture on one of the loads, which is the first time a
truly random draw was seen in a published build.

Not seen in the published build: the menus' actions carried through (they were driven in the
local build only), dark theme, right to left, Cantonese, and a real finger on a real phone.

Known and open:
- In the New tab catalog at 1440 px the page list sits in the right half of the panel with the
  left half empty: the strip's tab group rule shares the class name and the shadow root.
  Fixed in source after build 130, not seen.
- In both-languages mode one placeholder in the hide dialog is cut.
- The phone sheet lists groups before loose pages; the wide strip keeps a group in place.
- The shared tab menu actions write the main strip's keys, so section tabs use their own menu
  element instead of reusing the shared one.
- Why the full-mode container exited instead of restarting when the Docker engine restarted on
  12 November is not known.

The live instance was moved to build 130 after that pass (core 2026.11.1.130, Supervisor
2026.11.0.130, no unsupported or unhealthy reasons).

## Batches 28 to 30, 12 November 2026 (early morning): read this first

Commits `447cde08f`, `7b23aef30` and `4b47fc250`. "Local build" means the interface built from
the working tree in a Linux container, served by a throwaway copy of a published build with the
changed server files mounted over it, and driven with headless Edge. None of this had been seen
in a published build when this was written; the release that carries it was still building.

- Tab options: the strip docks to any edge (a new installation starts on the left, an existing
  one stays at the top), pinned region, groups (picker, menu, editor, look, lock), per-tab look,
  tab locks, overflow list, bulk close with a preview, four separate searches, a right-click menu
  per tab. Settings section tabs are real tabs with overflow, pin, hide and reorder. The phone
  Pages sheet has per-page actions and bulk close. Seen in a local build at all four edges, at
  390 and 320 px, in the dark theme, right to left and Cantonese; seven defects found there were
  fixed. Not exercised: dashboard edit mode with a docked strip, the colour field of the tab look
  editor, the menu-key path, dragging a tab out of a group, both-languages mode, a true 200
  percent display scale. Known leftovers: "Close other tabs" preview does not count the tab that
  was right-clicked as staying open; opening the group picker from the all-tabs search closes
  that panel; the automation editor's save bar floats above the page bottom with a left or bottom
  strip (older than this work).
- App install progress: bar, three steps and a log terminal on the app page, the store card and
  the activity tray. Seen on a throwaway full-mode instance, including a dropped connection and a
  failing install. The Supervisor reports only a percentage, so there is no layer list and no
  Cancel. Not driven in a browser: rebuild, uninstall, an update from the Updates page, the app's
  own log (full mode has no journal service).
- Drop a picture, video or audio file on any page: overlay with Media and Images, upload queue in
  the activity tray, a message with a jump to where the files went. Limits are 2 GB (media) and
  50 MB (images); pictures the image store cannot take are converted, oversized ones re-encoded,
  and the loss is stated. "Add media" for phones is in the Pages sheet menu, the Media toolbar,
  the activity tray and the quick bar; paste works outside text fields. Seen in a local build
  with simulated drags and a scripted file chooser, not with a real drag, clipboard or camera.
- Image store folders, and download, edit name and convert in the Manage dialog for media and
  images. Image ids and serve addresses are unchanged. Seen in a local build at 1440, 390 and
  320 px. The picture chooser of the picture upload control goes through the media browser and
  shows the folders.
- Dim sum surprise: one draw per launch, shown one time in ten; the settings switch cannot be
  turned off; School mode hides it; one single-item download in ten arrives as a zip with the
  file unchanged plus a dish picture. Pictures come only from the public catalogue through the
  `dim_sum` server component, the one feature that contacts an outside address. The card and the
  zip were seen with the draw forced, against the real server component; a real random draw was
  not observed. On one earlier first start the catalogue was not cached (cause unknown, possibly
  a rate limit on the release list); an hourly retry covers it.
- Search inside the automation and script editors, a search on every nested list, and a filter by
  the entities used. Seen in a local build at 1440, 390 and 320 px; not in the dark theme,
  Cantonese or right to left.
- Repair dialog: a failed repair says so (seen); the second sentence, for a failed repair that
  left new issues, is unit tested only.
- Full hosting mode: the checks that cannot pass inside a container are no longer reported as
  unsupported. Seen on a throwaway instance. Supervisor unit tests were not run. An existing
  instance needs the new outer image and Supervisor.
- Deploy Assistant: with a wording file in use, a new deployment is named with the file's word
  for that kind of deployment. Seen in its headless demo and its tests (21 of 21); the built
  desktop window was not driven.

Checks on `4b47fc250`: type check clean apart from the two gallery errors; full suite 6,888
passed with the 3 known build-script failures; server tests for `dim_sum` (48), `image_upload`
and `media_source` (177) passed in the test container.

## Batch 27, 11 November 2026 (evening): read this first

What landed in this batch, and exactly how far each part was checked. "Local build" below means
the interface built from the working tree in a Linux container and served by a throwaway copy of
build 115, driven with a headless browser at 390 px wide (and 320 px where noted); it is not a
published build.

- Every personal setting is saved on the instance for the account (`settings_bundle` in frontend
  user data), through the same sync that appearance and personal wording use: preferences,
  schedules, locks, table layouts, saved patterns, change history, app name and logo, tool drafts.
  Sign-in tokens, rebuildable caches, per-device switches and typed developer-console and
  action-tool text stay in the browser. The inventory is in
  `docs/features/instance-sync/README.md`. Seen in the local build: a fresh browser with only the
  sign-in received preferences, four rules, a lock and hidden columns; a second account saw none
  of it. A review then proved two defects with failing tests (an endless upload loop, and one tab
  uploading another account's settings after an account switch in a second tab); both are fixed
  and covered by tests, and both fixes were seen in published build 119 (uploads settle after
  one or two; one account's stored settings held nothing of the other's). One limit found there:
  two tabs of different accounts share the browser's sign-in storage, and a token refresh in one
  can sign the other in as the first account; that is the sign-in storage, not the sync.
- Locks are saved with the account. Clearing browser data no longer removes a forgotten lock. The
  way back is in `docs/features/instance-sync/README.md` (stop Home Assistant, replace the lock
  entry with a removal notice in `.storage/frontend.user_data_<user id>`, start again). The PIN
  check data and a lock's one-time-code secret are stored with the account on the instance; the
  interface says so.
- Creating a lock works on a page opened over plain http (no `crypto.subtle`): the hashing falls
  back to the same algorithms in script (`frontend/src/common/locks/soft-crypto.ts`). Seen in the
  local build on a non-secure address: created in 435 ms, wrong PIN refused, right PIN opens, and
  the same lock opened on a secure address. A lock is named by its card's label, heading or first
  line instead of all its text.
- Schedule rules can depend on an entity (is, is not, above, below), alone or with a time window.
  Seen in the local build: a rule on a helper switched to "Applying now" when the helper changed,
  without a reload. A build before this one drops the condition, and a save there strips it on
  every device.
- No plain browser form controls: selects, sliders, checkboxes, radio buttons and colour inputs
  in 20 files use the product's own components; a test fails when a plain select or visible input
  comes back (`frontend/test/common/native-controls/`). Each was opened once in the local build.
  The defects found there were fixed afterwards and seen fixed in published build 119: seven
  messages that showed "Translation error" (a new test parses every string; the log has no
  formatting errors, against 7,764 before), info buttons named by an error string, notification
  checkboxes that did not select, the start cover of a lock (ten fresh browsers of ten), the YAML
  tools title, a plural, and touch targets in the pattern workbench and the appearance editor's
  buttons. Still under 44 px there and fixed afterwards, NOT seen: sliders (only the middle
  32 px reacted), the compact text field, the filter chips beside a table's search field, and
  the colour field's marker over the Hue label.
- Phone layout, seen in published build 115: the YAML tools page is one column, the slim strip at
  the top is gone, the menu has less empty space. Seen in the local build: Personal settings can
  no longer be dragged sideways.
- Release workflow: a release is created only by a final job that runs when every build job of
  the run succeeded; a failed or cancelled run publishes nothing, and the update feed moves in
  the same step. Runs are queued one at a time and a started run is never cancelled, so a new
  push builds only after the run before it has ended (up to about two and a half hours). Container
  images are still pushed by their own jobs. NOT run yet: the first run of this workflow is the
  proof.
- Operating system builds failed in builds 111, 114 and 115 because a Go module host refused
  connections; the build now asks the official module mirror first. NOT proven until a run.
- Building the interface on Windows itself failed on a path pattern in
  `frontend/build-scripts/bundle.cjs`; the pattern accepts both separators now. NOT proven.
- The build 109 operating system image was booted in a virtual machine. Its Updates page offered
  nothing because the feed still names operating system 18.5.71, so a real update install is
  still not seen.
- Closed by the owner's decision without a device check: "Add media" on a real iPhone, a passkey
  on a hardware key or phone. Release 110 (no container image) was deleted at the owner's word.
- After batch 27 on 11 November 2026: five waves from one automated run are on `main` (bulk
  actions on six more tables; toasts, notification severity, statistics strip, draft recovery;
  named test cases, dry run, repository strip, save bar, starting points; type scale, named
  palette, practise control, tab group search; header page tools, setup flows, support tickets,
  command search keys). Each passed the type check, the full suite and the public-wording scan;
  NONE of it has been seen in a browser. `CHANGELOG.md` and `docs/feature-status.md` list each
  item. Also landed: official backup compatibility (see `docs/features/backups/official-backups.md`),
  the polish list from the design lane's boards, and seven Deploy Assistant polish fixes.
- Evening of 11 November 2026, after the five waves: build 121 was looked at in a browser by three
  passes. Official backups restore through the interface (seven checks, all pass, including a
  backup made here restored by official 2026.11.1). The polish list passes except three items
  fixed since. The five waves work, with the defects listed in `CHANGELOG.md` fixed since and NOT
  yet seen. Lesson for future waves: twice a component was built and tested but wired into no
  page (the statistics strip, the worked example); a wave is not done until a page uses it.
- "Full" hosting mode (`hosting/full/`, `compose.full.yaml`, `host.bat --full`,
  `docs/features/hosting/full-mode.md`) was proven on a throwaway copy with a locally rebuilt
  Supervisor. Before it can be used: a published build that carries the Supervisor change in
  `supervisor/supervisor/host/firewall.py`, and the first run of the workflow's `full` job. The
  owner has asked for the hosted instance to move to this mode once it is verified: rehearse with
  a copy of the instance's `config` folder first, keep the plain container stopped (not removed)
  as the way back. Open decisions taken by default: the core answers on port 80 inside the outer
  container; the host restart and shutdown controls should be hidden in this mode (not done);
  the Repositories page should list the built-in repositories (not done).
- Release 2026.11.1.121 is the first complete release under the "publish only when every job is
  green" rule; the update feed moved with it. A real operating system update install on a booted
  virtual machine was started after that and its result is not recorded here yet.
- Late on 11 November 2026: BUILD 122 HAS A REGRESSION (every toast pushed off a phone screen); the
  hosted instance was moved to 122 too early and rolled back to 121. Do not move the hosted
  instance to a build with interface changes before a browser pass on that exact build has
  finished. The fix and the rest of that pass's findings are in the build after 122, measured in a
  local build. A real operating system update install was seen in a virtual machine (see
  `CHANGELOG.md`); its false "finished" message is fixed in source, not yet seen. Full mode works
  with the published images of release 122 and was rehearsed with a copy of real settings
  (`docs/features/hosting/full-mode.md` has the corrected copy command and the reverse proxy
  note). The owner has said the hosted instance is a test instance and may be moved to full mode.
- The noise in the frontend tests (135 unhandled errors from one layout test file) is removed:
  `test/setup.ts` defines the build-time values and form stubs.
- Release 119 was not published: every build job of run 119 succeeded, including all four operating
  system images, but GitHub Actions had an outage and the final publish job never got a runner. Its
  staged files are kept for three days; re-run the failed job once Actions is back.
- Frontend suite at batch 27: 5,845 pass and 3 fail (`build-management.test.js`, as before); after
  the five waves 6,232 pass and the same 3 fail. Test files that
  used to fail to load now load; one stale test in `test/panels/marketplace/` was corrected.

## Where things stand

Work stopped at a checkpoint, not at the end. Everything written so far is on `main`; nothing is
left only on one machine. The goal is fixed: all 237 boards on 18 canvases built and matching.
`ROADMAP.md` is the full list. `docs/feature-status.md` states, row by row, what is built and
what has really been seen in a running build. Read both before trusting any summary.

- `main` holds the vendored upstream sources, the release workflow, the update feed tooling, the
  build scripts, the complete design (`design/`), the interface work in `frontend/`, new
  server integrations in `core/homeassistant/components/` and the Deploy Assistant
  (`deploy-assistant/`).
- Most of what was built on 10 November 2026 has been checked only by lint, the type check and
  unit tests. The list of what was really opened or driven in a running build that day is at the
  top of `docs/feature-status.md`; anything not on it is not seen.
- Build 1 (`v2026.11.1.1`) built and published the frontend wheel, every container image and the
  update feed. Builds 64 and 65 were published without images (a push that changed many files
  was mistaken for a documentation-only push); the release workflow now compares with the last
  build that published images. Build 66 is the first with images again.
- Open work is tracked in issues 1 to 11 of this repository and in the lists below.

### What landed on 11 November 2026 (batches 20 to 23), and how far it is checked

Later than the section below; where the two disagree, this one is newer.

- `d68fda3b1` (batch 20): safety fixes from the review of batch 19. A request naming "." as the media
  folder resolved to the media directory itself, so a recursive delete could remove all of it; "."
  and the source root are now refused (the tests failed 19 times against the old code). Confirmed
  counts are enforced, upload and single-file delete no longer follow a linked directory out of the
  media folder, errors no longer send a server path, and the Manage dialog is for administrators
  only. The paid cloud service is hidden without changing anyone's configuration (a voice pipeline
  already set to a cloud engine keeps showing it, a configured cloud backup location is hidden and
  kept, the network form no longer saves a cloud address as a custom external URL). Eight file
  fields use a visually hidden field that phones open reliably.
- `88b36b5d8` (batch 21): the file converter was hardened against hostile files (a TAR header with a
  negative size looped for ever; photo rotation read only from the Exif block; pictures in a PDF
  stay compressed and capped; every audio wait has a time limit and a run can be cancelled; long
  odd text is bounded; names with direction overrides or control characters are refused or
  cleaned). Version picker fixes (Enter on the buttons inside the field, touch keyboard, "Show
  more", slow compare answers). The bottom navigation bar publishes its visible height so the
  editor save bar, the accessibility panel and the picker stop reserving room for it while it is
  hidden; a group chip no longer scrolls its title under the pinned chips; accessibility buttons
  are at least 44 px.
- `ba7a6a431` (batch 22): the Activity page has a permanent record, a new integration
  (`core/homeassistant/components/activity_record/`) that writes everything the page shows to a Git
  repository in the configuration folder, one file per day, and never purges, rewrites or squashes
  it, with a Permanent record page (`docs/features/activity-record/README.md`). Rows in the
  expanded menu are 48 px (the collapsed rail keeps 56 px).
- `e0f2d7235` (batch 23): the record keeps its promise after a review found it could lose entries
  and cost too much on a Raspberry Pi. A failed write goes back to the front of the queue and is
  retried; a bad entry becomes a line saying so; a drop is counted only on a real overflow and kept
  on disk; a deleted or edited day file is restored from the last commit with a copy of the edited
  one kept beside it; a key for a Git remote lives outside the repository; a day is written in
  chunks of about 1 MB; commits default to every ten minutes and at shutdown; one search at a time;
  a second instance on the same folder is refused.
- `5fbf6d91b`: a tab's version count in the dashboard history rows no longer wraps onto two lines
  (seen in build 103 at 390 px).
- The hosted instance on the owner's network runs build 2026.11.1.106. Builds 102 and 105 were
  skipped on purpose: 102 lacked the media folder safety fix and 105 had the first version of the
  activity record.
- Verified by running: frontend type check clean; 5,401 frontend tests pass with the unchanged
  baseline of 3 failures and 46 files that do not load; server tests in a Linux container: activity
  record 124 passed, automation and dashboard history 157 passed, media source 141 passed, Ollama 88
  passed. The activity record was run on a throwaway copy across two restarts (it kept its
  first-version day file, wrote the new chunk and committed at shutdown), and on the hosted
  instance at build 106 it created its repository and first day file.
- Seen in a running build (build 103, headless browser at 390 px wide, signed in with a generated
  test account on a throwaway copy): the file converter (categories show Ready, none shows
  "Unavailable"), the support page, the Minecraft servers empty state, the profile security page
  with the authenticator card, the Ollama empty state, the updates page, media sources, the
  dashboard history overview with its search field and correct plural forms, and the voice
  assistants page with no cloud promotion. In build 106 the same way: the Permanent record page
  (status Recording, counts, one day listed).
- Seen or run for real on 11 November 2026, in build 106 on a throwaway copy with a headless
  browser at 390 px wide: the expanded menu's rows measure 48 px; in the media Manage dialog
  pressing "Add media" opened a file chooser, an uploaded picture was listed and was on disk,
  and a new folder was created; the version picker opened, listed the versions and a chosen
  version produced a compare. The Ollama pages and test chat were run against a real Ollama
  server, and the Minecraft manager against a real SSH and Docker host (a throwaway container
  with its own Docker engine); see their feature pages. That run found the Paper version list
  address retired by its service, fixed in batch 24.
- Seen or run for real on 11 November 2026 in build 109, at 390 px wide with a headless browser:
  the save bar in the automation, script and scene editors (Saved, Unsaved changes, Saved);
  schedules (a rule made, applied and kept after a reload); the converter (zip, tar, gzip, PDF,
  DOCX and WAV conversions each produced a real file); the embedded page panel's reload and its
  slow-page notice; a finished entry in the activity tray with Open, Undo and Dismiss; the Ollama
  models table scrolling sideways with no word broken, and a download failing cleanly when the
  server was stopped part way; passkeys with a browser virtual authenticator (add, sign in
  without the password, remove, clean failures); Enter confirming the New folder prompt; and the
  Minecraft version lists refreshing for real, with vanilla 1.21.8 starting.
- NOT seen in any browser: the update install progress and recovery card during a real install.
  The build 109 operating system image was booted in a virtual machine on 11 November 2026 and
  its Updates page offered nothing, because the update feed still names operating system 18.5.71:
  the operating system jobs of builds 111 and 114 failed when an outside Go module host refused
  connections, and those of 110 and 113 were cancelled by newer pushes. Closed by the owner's
  decision on 11 November 2026 without a device check: "Add media" on a real iPhone (seen working
  in a headless browser in builds 106 and 109) and a passkey on a hardware key or phone (run with a
  browser virtual authenticator). Seen in build 113: an activity tray entry while running (a real
  model download with its progress bar, Cancel and Open), finishing, and cancelled from the tray;
  the download stops by design when its page is left, and the entry says so. The three batch 25 changes were run in build 111 on a throwaway
  copy: through the manager on a real SSH and Docker host, vanilla 26.3 and Paper 26.3 started on
  the Java 25 image, 1.21.8 on Java 21, 1.20.1 on Java 17 and 1.16.5 on Java 8, each with the
  server's own "Done" line and the right image named on its page; with the Ollama server stopped
  the Models section said no server is answering, and listed models again once it was back; the
  "Page not showing?" button showed its explanation on a page that refuses framing, Dismiss and
  Reload cleared it, and the toolbar fitted at 390 px wide.
- Known limits: the activity record can still lose entries in the ways its documentation lists (a
  power cut in the seconds before a flush, a real queue overflow, shutdown while the disk is
  failing) and does not import entries from before it started; reading PDFs, MP3 output and
  video-to-video conversion are not offered; the paid cloud service is hidden in the interface
  only and remains visible in a few places for someone who has it configured (an existing
  cloud-stored backup's location name, one entity filter); passkeys were run with a browser virtual authenticator, never with a hardware key or a phone; Minecraft 26.3 failed on the Java 21 image in build 109 and starts on the per-version image in build 111; the operating system image was built in build 109 after the two unit files were renamed (the generic virtual machine image and the Raspberry Pi 3 image; the Raspberry Pi 4 and 5 jobs of that build were cancelled by a newer push), and the build log shows both mount units enabled under their real names; that image was booted in a virtual machine on 11 November 2026 (first start finished, the supervisor reported healthy, and the journal shows both mounts made); a documentation-only push (run 112, 11 November 2026) finished without publishing a release, as intended.
- Closed by the owner's decision: the phone app's earlier setup problems (nothing left to fix).

### What landed on 11 November 2026 (batches 18 and 19), and how far it is checked

- `8fa63f05d` (batch 18): settings saved on the instance are tied to the signed-in account (a cache
  from another account is cleared before anything is shown or uploaded); picture layers may only
  be embedded images or paths on this instance; a hostile appearance value cannot write onto shared
  prototypes; error text redaction hides secrets inside values, in query strings and after a raw
  at-sign; a personal setting a person chose is kept even when it equals the default; Undo and Retry
  in the activity tray run once. New: update install stages and a recovery card, the Minecraft
  server page, Ollama unload, model details and test chat, the support page and bundle, one save
  bar in the editors, embedded page panel changes, Cantonese for eight more blocks.
- `f86ff751a`: the pinned group header in card-style lists (the Marketplace on a phone) no longer
  lays out in the flow.
- `cbefeaf48`: the Dashboard tools dialog in edit mode (`docs/features/dashboards/dashboard-tools.md`).
- `0d056629e` (batch 19): the "Add media" fix, media folder management, the image upload button, the
  paid cloud service hidden in the interface (server integration unchanged, by the owner's
  instruction), history search and a version picker, "Git remote" wording, the accessibility "+"
  button on one line, new converter formats (archives, PDF output, Word, audio to WAV, a still
  from a video), and review fixes (read-only automation, slow restart, support bundle addresses,
  Minecraft request pile-up, test chat model check).
- Release workflow commits: `5b2c6af85` (see below), `b64779d75` (its message belongs to another
  project; it copies the Deploy Assistant installers straight after the release is created and
  withdraws a release when no build job of its own attached a file) and `3ce9e087a` (records what
  `b64779d75` really changed). History is not rewritten.
- Verified by running: frontend type check clean; 5,337 frontend tests pass with the unchanged
  baseline of 3 failures and 46 files that do not load; server tests in a Linux container: media
  source 109, Ollama 88, and earlier on 11 November passkey 143, Minecraft manager 217, frontend
  storage 36, automation and dashboard history 157.
- Seen in a running build (build 2026.11.1.96, throwaway copy, 390 px wide): the Marketplace list
  scrolls with its group header pinned; the Personal settings preview scrolls away and only the
  group chips stay pinned; the accessibility panel's rows no longer overlap (its "+" button wrapped
  onto its own line in that build; the batch 19 fix is unseen).
- Release pipeline, observed: every release carries the Deploy Assistant installers (v2026.11.1.88,
  .91, .93); runs replaced by a newer push are cancelled and leave no release; 37 empty releases
  were removed by hand. Observed later: a documentation-only push (run 112, 11 November 2026) finished without publishing a release, as intended.
- The hosted instance on the owner's network runs build 2026.11.1.96. Builds 88 and 91 were skipped
  on purpose because settings saved on the instance could cross between two accounts on one
  browser; batch 18 fixed it.
- Not seen in any browser: update install progress and recovery card, the Minecraft server page,
  Ollama unload, model details and test chat, the support page and bundle, the save bar, the
  embedded page panel, media folder management, the "Add media" fix (reported broken on an iPhone;
  fixed in source only), the image upload button, hiding of the cloud service, the new converter
  formats, history search and the version picker, the "Git remote" wording, the Cantonese
  additions, and the dashboard tools dialog.
- Known open as of batch 19 (the newer section above supersedes what changed: the save bar's blank
  strip and the blank cloud voice picker were fixed in source in batches 20 and 21 and are not seen;
  the phone app's setup problems are closed by the owner's decision): reading PDFs, MP3 output and
  video-to-video conversion are not offered; the Minecraft manager has never been run against a
  real Docker host; the Ollama page has never been run against a real server; passkeys have never
  been used with a real authenticator; the operating system image was built in build 109 after the two unit files were renamed (the generic virtual machine image and the Raspberry Pi 3 image; the Raspberry Pi 4 and 5 jobs of that build were cancelled by a newer push), and the build log shows both mount units enabled under their real names; that image was booted in a virtual machine on 11 November 2026 (first start finished, the supervisor reported healthy, and the journal shows both mounts made); `deploy-assistant\build.bat` (another lane's) has not
  been run by this work.

### What the last two commits of 10 November 2026 changed, and how far it is checked

- `5b2c6af85`: a plain clone now works on Windows (two mount units with a backslash in their
  names are stored as `__x2d__` and renamed back by the operating system post-build script); the
  local frontend container build is held to four processors (two on a retry) after it crashed on
  a machine with 32; the build context no longer carries the host's `node_modules`; a push that
  changes only documentation or design files publishes no release; a run that attaches no file
  withdraws its release and tag; every release gets the newest Deploy Assistant installers. The
  old workflow had left 37 releases with no files (a push that built nothing still created a
  release and a tag); they were removed.
- `0d9dc73d4`: review fixes (Minecraft over SSH, automation and dashboard history, Ollama, the
  shared app name and logo, the dashboard import summary), appearance and personal wording saved
  on the instance for the signed-in account and included in backups, an authenticator card on the
  profile page, an activity tray and recovery card, schedules and shared defaults for personal
  settings, information buttons, split panes and a resizable filter pane, starting points for
  empty editors, and fixes for defects seen in build 80.
- Verified: 623 server tests pass in a Linux container (passkey 143, Minecraft manager 217,
  Ollama suite 70, frontend storage 36, automation and dashboard history 157); the frontend type
  check is clean; 5,093 frontend tests pass with the baseline unchanged (3 failures and 46 files
  that do not load); the production frontend container build completes; a plain clone checks out
  on Windows 11; the changed server integrations load without errors in a running copy.
- Not verified: none of the new pages or components has been opened in a browser; the operating system image was built in build 109 since the file rename (see the newer section above); the new release workflow jobs have not run;
  `deploy-assistant\build.bat` (added by another lane) has not been run; the build fix has been
  tried on one computer only.
- Boards that are now partly built: Authenticator (the profile card is built; the Tools code
  generator is not, because the browser has no credential vault), QR pairing (it is the lock
  wizard's QR step, already built), Panels, BlankEditor, Schedule (time rules built; entity and
  web-service triggers not), GuidedForm (information buttons built; worked example and practise
  control not), Progress (tray and recovery card built; the update dialog is not wired in; draft
  recovery is design only).

## What is known to be unfinished or untrue yet

State these plainly to anyone who asks:

- The test address through the tunnel still answers 502 until one proxy entry is added on the
  tunnel host. Nothing in this repository can fix that.
- No operating system image has been booted with an over-the-air update. The signing secrets
  exist since 10 November 2026, but no build has finished its operating system images since
  and no update between two such builds has been watched. Only the VMware image was started.
- The companion phone app connected after a proxy fault was fixed. The setup problems the owner
  reported with it are closed by the owner's decision; nothing is left to fix.
- The Welcome screen of first-run setup was seen still showing upstream items (a cloud restore
  and outside links). The fix is in source and has not been seen.
- Opening an editable copy of Overview straight in edit mode was broken and is fixed in source,
  and so is the welcome banner covering the Overview header at phone width; neither fix is seen
  in a running build (the banner fix was confirmed only by applying its rule in the open page).
- The passkey sign-in page and card, the Google setup page, the dashboard history page, the
  Minecraft and Ollama pages, the problem log page, the offline help reader, and every page
  listed as "not yet seen" in `docs/feature-status.md` have never been opened.
- The Python tests of the new integrations (`core/tests/components/`) were run in a Linux
  container for the last batch: 623 pass (see above). The passkey tests were also run in a running
  copy. No real authenticator, Docker host over SSH or Ollama server has been used.

## Remaining work, in the owner's order

1. Backups must carry every automation repository with its history, and a restore must bring
   them back. Only read so far. The repositories are in `automation_repos/` inside the
   configuration folder: a master `.git`, and one `.git` under `automations/<name>/`. Neither
   exclude list names that folder or `.git`: `EXCLUDE_FROM_BACKUP` in
   `core/homeassistant/components/backup/const.py`, and `HOMEASSISTANT_BACKUP_EXCLUDE` as used in
   `supervisor/supervisor/homeassistant/module.py`. So they should be in a backup, but no backup
   has been made and restored to prove it. Make one on a running instance, list the archive for
   `automation_repos/**/.git`, restore it into an empty configuration folder, then compare
   `git log` and run `git fsck` in every repository. Add a test, and say on the backup page that
   the repositories are included. The same applies to `dashboard_repos/`.
2. Run the newest published container image as it is and confirm what was added since build 38
   (two-key confirmation, the System page, large cards on Home, the Base64 and Colour tabs,
   About, What changed, list changes, Notifications as a page, locks on single elements, and
   everything built on 10 November). Then move the tag in `compose.yaml`.
3. Carry on down `ROADMAP.md`.

### Queue taken from the reviewers' notes

Setup and interface:

- Every setup wizard must be a fully interactive setup, not a row of Next buttons: real controls
  for every value (pickers, sliders, toggles, discovered-device choices, file pickers), live
  validation, a real "test this" action where the server can do one, a live summary of what
  will be written, progress with Back and Next and jump to a step, save and resume, skip for
  optional steps, keyboard reachable, localized. Covers guided setup, first-run setup, the
  config-flow dialog and the lock wizard.
- First-run location step: an outside lookup sits behind a confirmation dialog (it is no longer
  contacted without a button press); decide whether to keep or remove it. The integrations step
  (device list, scan again) is not yet interactive. New lock keys need Cantonese: the
  `policy_*_desc`, `skip`, `rules_*`, `pin_rule`, `password_rule_*`, `step_try`, `try_*` and
  `summary_*` keys under `ui.locks`.
- Sensor history tab shows a double chart (`ha-more-info-history-and-logbook`).
- Script editor: Save in a bottom bar needs the shared `automation/ha-manual-editor-mixin.ts`;
  `fields_empty` is unused. Automation editor: a sticky bottom bar next to Save needs the same
  shared editor layout.
- Google one-time setup: the Nest guidance (the separate paid Device Access registration and
  taking the project ID) is not built; enabling services with a real key is not exercised.
- Minecraft server manager: version lookup, start, stop and logs exist on the Docker over SSH
  target (217 server tests; no real Docker host used). Still to do: the other four targets,
  backups and the world generator. How a containerised install hosts another container: SSH to a
  Docker host (default), opt-in Docker socket mount, or an app on operating system installs; a
  process inside the container is the weakest. The reviewers' findings that port conflicts were
  keyed by target type rather than host, that nothing checked the ports this instance uses
  (8123), and that a corrupt stored item raised at list time are not confirmed fixed. Fixed in
  the last batch: the SSH config file is never read, remote output is read in bounded chunks,
  objects are acted on only when they carry this manager's label, a changed key type counts as a
  changed key, and rename and delete are refused while a container exists.
- Entity dialogs, open review findings: water heater switch name, state shown by colour alone on
  humidifier, weather unit at 320 px, sensor attributes.
- Backup setup dialog: a save that never settles can block later saves, and a failed save from
  the encryption switch may leave the local config showing the new key. Time-box and revert.
- Automations list: "select all N matches" with collapsed groups selects fewer than N. The tables
  that have their own bulk bars and no "hidden selected" count (entities, devices, backups,
  blueprints, scenes, tags, application credentials, dashboards, expose, statistics, the
  marketplace) act on rows the person cannot see if hidden rows were ticked earlier.

Findings in the offline help, of the second review (several were fixed in source by commit
`c9b9d007a`; those marked confirmed were checked by reading the current code):

- Confirmed fixed in source: help links open through `openHelpUrl` (DD1), the expansion panel's
  transition completion (EE1), the row animation listener (EE2), a failed flow reporting back so
  first-run cannot stick (FF1), place search encoding (FF3), the Minecraft version and name
  patterns using `fullmatch` (GG1), the backup dialog ignoring presses while a save is pending
  (HH1), the header checkbox keeping hidden selections only where a page opts in (II1), the
  documentation host pattern (DD7), and slug validation (DD8).
- Not confirmed either way, check before relying: literal help links on the login and landing
  bundles (DD2), converter edge cases and Liquid inside code blocks (DD4 to DD6), heading ids
  and anchors (DD9), the integration documentation links in the guided setup wizard (DD10), the
  Enter key in the location step (FF2), and surfacing server-level Minecraft errors in the wizard
  (GG2).

Passkeys (reviewers' findings on `core/homeassistant/components/passkey/**`): the registration
challenge pool, the stateless sign-in token, fresh sign-in before adding a passkey, the counter
race, the host character checks and the default-integrations list appear fixed in source and are
covered by the 143 passing server tests. Not confirmed: hiding the sign-in button when the host
is an IP address and asking the server first whether passkeys are usable, the card's statements
that a passkey keeps working after sessions are signed out and skips a second sign-in step, and
a "remove all passkeys" button. No real authenticator has been used.

Deploy Assistant (`deploy-assistant/`, owned by the design lane; changes need a decision):

- SSH host keys are never verified (no `hostVerifier`): a login can be intercepted. Fix: trust on
  first use with a stored fingerprint shown to the person, and refuse a change.
- The Raspberry Pi card writer wipes the selected drive; the drive filter (no boot or system
  disk, 512 GB cap) is the only guard read. The confirmation step and the writer were not read.
- Automatic download starts a few seconds after launch and every six hours, connects to every
  saved host by SSH and runs `docker pull` unprompted; the switch is on by default.
- `memoryLimit` and `timezone` are written into generated compose YAML without newline checks.
- The workflow `deploy-assistant.yml` runs `npm test` (project policy: no tests in CI), publishes
  a release on every change under `deploy-assistant/**`, and never reads the release back.
- The default image tag is `latest` (the project pins a tag). The app's own releases crowd the
  50-release window that is scanned for operating system image assets.
- `mock.js` ships in the real app. Auto-update exists but has not been seen applying a real
  release.
- Not read in full: `manager.js`, the renderer `app.js`, `writer.js`, `virtualbox.js`,
  `vmware.js` and the unit tests.

## Checking against a real instance

The published image runs in Docker, and the frontend in this repository can be served from it,
which gives every settings page with a real server behind it:

1. `docker run -d --name ha --network host -v <config dir>:/config -v <repo>/frontend:/frontend-dev:ro ghcr.io/ding-ding-projects/home-assistant-material:latest`
2. In `<config dir>/configuration.yaml`, under `frontend:`, add `development_repo: /frontend-dev`.
3. Run `npx gulp develop-app` in `frontend/` and wait for "Build done" **before** starting the
   container, or restart the container afterwards: it only serves folders that existed when it
   started. New translation strings need the build restarted.
4. Open port 8123. Rebuilds are picked up on reload.

The demo build (`npx gulp develop-demo` in `frontend/`) has no settings pages, so tables,
pickers, logs and the automation editor are not seen there; open port 8090.

## Things to know before editing

- To add a search field, read the comment at the top of
  `frontend/src/common/regex/search-surfaces.ts`: every search field must be listed, and a test
  fails otherwise.
- The demo and development builds do not minify templates; the production build does, and its
  legacy pass can fail on a template the other builds accept (an expression inside an inline
  `style="..."` attribute is the known case; use `styleMap`). Before pushing interface work, run
  `node build-scripts/check-minify-templates.mjs <changed files>` in `frontend/`. Builds 23 to 25
  failed this way and have no images.
- The changelog is shown in the interface. `CHANGELOG.md` has a heading for each day
  (`## 2026-11-10`) and one bullet for each change. After editing it, run
  `node build-scripts/sync-changelog.mjs` in `frontend/`; it writes
  `frontend/src/data/changelog.json`. A test fails when the two differ.
- The offline help articles are refreshed by `node build-scripts/sync-help-articles.mjs` in
  `frontend/`, run by the maintainer; the interface never fetches them at run time. Their
  licence, attribution and source commit are in `frontend/public/static/help/LICENSE-NOTICE.md`.
- A local change is only in History if its store calls `noteLocalChange` (see
  `common/history/local-history.ts`). Locks must never be added there.
- To give another layout the page tools, render `<ha-page-tools>` in its header,
  `<ha-page-footer>` after its content, and use `PageLockController`; `hass-subpage.ts` is the
  shortest example. Still without the tools: the dashboard header (`hui-root.ts`),
  `ha-top-app-bar-fixed.ts` and the developer tools' own headers.
- Every push to `main` publishes a release. Pushes that touch only `design/`, `docs/`, the
  Deploy Assistant or Markdown files, on top of code whose images were already published, skip
  the image builds.
- A build that has started always finishes. While it runs, only the newest waiting build of each
  kind is kept; older waiting ones are dropped, so some releases carry notes and no images. The
  newest push is always built. Operating system builds take hours.
- Build versions are `<upstream version>.<workflow run number>`. The committed sources keep the
  upstream numbers; `scripts/ci/set-versions.py` stamps the build number inside the runner.
- Integration translations are copied out of the upstream image for the pinned core release,
  because upstream downloads them with a private token.
- The `RAUC_CERTIFICATE` and `RAUC_PRIVATE_KEY` repository secrets exist since 10 November
  2026 (a self-signed certificate made for this project; the owner keeps the only copy of the
  key outside the repository). Builds after 55 sign their operating system images with it and
  offer them over the air. Systems installed from builds up to 55 need one fresh install
  first. No such update has been observed yet.
- Every edit to a vendored folder is listed in `docs/material-changes.md`.

## Next steps, in order

1. Run the newest published image and check each row of `docs/feature-status.md` that says "not
   yet seen in a running build", starting with the first-run Welcome screen, the passkey card,
   Google setup, dashboard history and the help reader. Record what was seen.
2. Make a backup on a running instance and prove the automation and dashboard repositories come
   back with their history (item 1 above).
3. Boot the VirtualBox image (`haos_ova-<version>.vdi.zip`) and a Raspberry Pi image, then an
   over-the-air update between two builds signed with the project's key.
4. Open each page of batches 18 to 23 in a running build (the lists under "What landed on 11
   November 2026"; the "NOT seen in any browser" list in the newest section is the shortest
   route) and record what is seen, starting with "Add media" and the media Manage dialog on a
   phone, then the activity record's search and a push to a real Git remote.
   Then open each page of the batch before: the authenticator
   card, the activity tray and recovery card, schedules and shared defaults, information buttons,
   split panes and the filter pane resize, starting points, appearance and wording saved to the
   instance (try a second browser and a restore), the import summary, and the archive list on the
   history pages.
5. Watch the next push that changes the product: confirm the Deploy Assistant files are attached,
   and that a documentation-only push publishes no release. Build the operating system image
   once and confirm the two renamed mount units are back under their real names.
6. Run `deploy-assistant\build.bat` and try the build fix on a second computer.
7. Work down the queue above and `ROADMAP.md`.
