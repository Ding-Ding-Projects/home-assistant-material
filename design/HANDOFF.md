# Design handoff

## Pass 1 (9 November 2026), superseded

- Artboards drawn: `Main.dc.html` (overview, light) and `EnergyDark.dc.html` (energy, dark).
- Owner review: too cluttered, not modern enough, and the required product features appear only
  in small pieces. Pass 2 replaces both boards.
- Six further boards are reserved in `canvas.json` and not drawn yet.
- Design guidance: the Stageshow skill, pinned copy at commit `299140fafd08df55a9c234e610c3f64af3f45531`.
  A fresh install was not possible in the session that made this pass, so the pinned copy was read.
  Rules applied: restraint, framing, hierarchy, icons from the product's own set. Its filming and
  rehearsal steps have not been run; no frames were rendered in this pass.

## Pass 2 (9 November 2026), complete as a design pass

Pass 2 replaces pass 1 after the owner's review. Direction: one calm floating pane, a slim rail,
quiet pill tabs, a single expressive hero card per screen, large type, fewer and larger cards.

- 48 artboards on 8 canvas pages. `canvas/canvas.json` lists every board with its page and frame.
- Sources are `source/*.src.html`. `source/inline-assets.mjs` expands the shared frame, list rows,
  switches and icons and writes the artboards to `canvas/`.
- `frames/` holds a headless Chrome render of each artboard at its native size. They render the
  design files, not the product.
- Type: Google Sans Flex with Roboto Flex as fallback, Roboto Mono for code, all under the SIL Open
  Font License. Icons: Material Design Icons, the set the frontend already ships.
- Nothing here is implemented in the product yet. `docs/feature-status.md` tracks implementation.

### Required feature to board map

| Feature | Board |
| --- | --- |
| Material Design 3 conformance, workflow navigation | Main, Energy, Settings, Phone, Tokens |
| Motion with a reduced-motion path | Settings (Motion), Accessibility, Tokens |
| Live charts | Energy |
| Practical first-run wizard | Onboarding |
| Language modes, playfulness sliders, dialog emoji switch | Language |
| Personal wording file, drop to apply | Vocabulary |
| Spoken narrator, action sounds | Narration |
| School mode, focus modes | Modes |
| Scheduled and external settings sources | Schedule |
| Renaming the app, logo customization | Identity |
| Dim sum surprise, public photo source | DimSum, Ladder (photo slots stay empty in the design) |
| Per-element appearance editor | AppearanceType, AppearanceLayers |
| Infinite colour picker and translator | ColorPicker |
| Font customization | Fonts |
| Accessibility tools, sizing without clipping | Accessibility |
| Overlays and panels, collapsible filters and statistics | Panels |
| Tabs, every tab open, New tab catalog | Main (tab bar), Tabs |
| Command palette | CommandPalette |
| Pattern builder on every search surface | Regex, and the builder button on every search field |
| Context menus with working shortcuts | ContextMenu |
| Rich controls wherever a value is shown | CommandPalette, Bulk, Minecraft |
| Guided forms, per-control information buttons | GuidedForm, Settings |
| Settings that explain themselves | Settings |
| Extension support | Extensions |
| Starting points for blank editors | BlankEditor |
| Two-key confirmation | SuperConfirm |
| Element locks | Locks |
| Unlock ladder | Ladder |
| Support Tickets | SupportTickets |
| Built-in authenticator, QR pairing | Authenticator, QrPairing |
| Free by default, honest when paid | About |
| Local version history | History |
| Export in every format | Export |
| Bulk actions | Bulk |
| Changelog viewer | Changelog |
| Offline help articles | Docs |
| Rendered provider text | ReleaseNotes |
| Notifications and their centre | Notifications |
| File converter | Converter |
| Base64 toolkit | Base64 |
| Minecraft server manager, world generator | Minecraft, WorldGen |
| Local Ollama suite | Ollama |
| External editor hand-off, publishing to a forge | Handoff |
| Drawing and annotation | Drawing |
| Progress where it started, recovery where it broke | Progress |
| Front-screen version and updated-at | Main (footer), About |
| Updates from this project | About, Progress, ReleaseNotes |

Not drawn, with the reason:

- Windows virtual disk manager: the product is a web application served from Linux and has no
  Windows host to manage disks on.
- Browser-extension download hand-off: there is no browser extension in this product.
- Job document wording: applies to job-related products only.
- Frameless window title bar: applies to installed desktop applications; this product runs in a
  browser or in the companion apps, which draw their own window.

### Design guidance used

The Stageshow skill, pinned copy at commit `299140fafd08df55a9c234e610c3f64af3f45531`. A fresh install
was not possible in the session that made this pass, so the pinned copy was read. Rules applied:
restraint, one hero per screen, hierarchy from proportion and space, icons only from the product's
own set, real words where the eye lands, no empty bands, no cut controls. Its rules for animated
marketing demos (cursor choreography, loops, crops that bleed off a stage) do not fit product
screens and were not applied. No gold example was copied: none shows a full application screen.

### Review record

Each batch was rendered to frames, read, fixed and re-rendered before it was published.

- Batch 1 (everyday screens): base rule was resetting button and link styles; empty band above the
  footer on Home; Settings board too short; wizard said a finished scan was still running.
- Appearance: both editor boards were too short and cut their last row.
- Navigation: the guided form cut its buttons; the starting-point cards wrapped to a second row;
  the pattern workbench left an empty band.
- Safety: a button modifier clashed with the icon tile class and stacked a label under its icon;
  the dish game's answer buttons overflowed their card.
- Tools: the world generator's button count disagreed with the selected area; a nested button in
  the account list.
- System: the About board's second column wrapped below the first.

Open after this pass:

- Photo slots (dim sum, camera snapshot, help article screenshot) are labelled placeholders. They
  take real pictures only from the product or the public photo catalogue.
- Dark theme is drawn for Energy only. The tokens define the full dark scheme.
- Cantonese copy on the Language, Narration and Docs boards needs a native review.
- No motion was filmed: the boards are stills.

## Pass 3 (9 and 10 November 2026), complete as a design pass

Pass 3 answers two reviews by the owner: every page of the product must be drawn, not only the
feature boards, and every board must carry the required features in full.

- 153 boards on 11 canvases in `canvases/`, at most 15 on each. Pass 2's 48 boards are kept on
  canvases 01, 02, 04 and 09 to 11.
- 105 boards are new: every panel, every settings page, the system pages, the developer tools,
  the protocol pages, 36 entity dialogs, sign-in, the first-run steps and the preparing page.
- The new boards are generated. `source/pages/p_*.py` describe each page; `source/pages/lib.py`
  holds the shared parts. Heights are measured in a browser so no board is clipped.
- Every page board has, in its header: a search field with the pattern workbench button, edit
  appearance, read aloud, history, export, lock, help. Every table has select many, columns and
  export. Every dialog has history, settings, its own search with the pattern button, edit
  appearance and lock. The footer shows the version, the language mode and the right-click hint.

### Automations

| Requirement | Board |
| --- | --- |
| A Git repository for each automation | AutomationRepo, and the repository strip on AutomationEditor |
| A master repository; one push commits every automation repository, then the master | AutomationsMaster |
| A history manager: every version, test one version, test many, run many | AutomationHistory |
| A test button on every Choose option and every condition | AutomationChoose |
| A dry run of the whole automation | AutomationEditor |

### Review record

Every board was rendered and read. Fixed in review: pages taller than the frame were clipped;
fields in a row were too narrow for their values; label colour dots did not show; table columns
overlapped; five icon names did not exist in the icon set; the MQTT quality-of-service field
wrapped its value.

Open after this pass:

- Dark theme is still drawn for Energy only.
- The phone layout is drawn for Home only.
- No board in this pass is built in the product. The pattern workbench is the first to be wired
  in; see `docs/feature-status.md`.

## Pass 4 (10 November 2026), the polish pass, complete as a design pass

Answers `DESIGNER-HANDOFF.md` of the same day: every surface built in code without a board, the
eight decisions the audit asked for, and a project page. 34 boards on four new canvases; no
earlier board changed.

- Phone boards are drawn at 320 px, the narrowest width the product supports, three screens to a
  board, with at least one in dark. Wide boards are 1440 px with a dark variant where it differs.
- Each board ends with "What this board settles" and, where the build should change, "Works
  differently from today's build". The code follows those lines.
- Every search field on these boards carries the pattern workbench button, including fields
  with typed text, the menu search and the search of open pages on a phone.
- Sources: `source/pages/polish_lib.py` (phone frame, sheets, keypad, steppers) and
  `p_polish_a.py`, `p_polish_b.py`, `p_audit.py`, `p_site.py`. `source/pages/build_polish.py`
  writes the boards, measures their heights in Chrome, writes `canvas.json` and renders
  `frames/`.
- Design guidance: the Stageshow skill, pinned copy at commit
  `299140fafd08df55a9c234e610c3f64af3f45531`; a fresh install was refused in the session that
  made this pass. Applied: restraint, real product pictures only (the project page uses
  screenshots from running builds), one hero per screen, no cut controls. Not applied: its
  filming and motion steps; these are stills.

### Boards added

- `canvases/12-polish/WorkbenchPhone.dc.html`: Pattern workbench on a phone.
- `canvases/12-polish/WorkbenchWide.dc.html`: Pattern workbench in a wide window.
- `canvases/12-polish/ElementMenuPhone.dc.html`: Element tools on a phone, opened by touch and hold.
- `canvases/12-polish/ElementMenuWide.dc.html`: Element tools in a wide window.
- `canvases/12-polish/LockWizardPhone.dc.html`: Lock wizard on a phone.
- `canvases/12-polish/LockWizardWide.dc.html`: Lock wizard in a wide window.
- `canvases/12-polish/UnlockPhone.dc.html`: Unlock prompt and PIN keypad on a phone.
- `canvases/12-polish/UnlockWide.dc.html`: Unlock prompt in a wide window.
- `canvases/12-polish/LockListPhone.dc.html`: List of locks on a phone.
- `canvases/12-polish/LockListWide.dc.html`: List of locks in a wide window.
- `canvases/13-polish/PersonalPhone.dc.html`: Personal settings on a phone.
- `canvases/13-polish/PersonalWide.dc.html`: Personal settings in a wide window.
- `canvases/13-polish/SetupListPhone.dc.html`: Guided setup list on a phone.
- `canvases/13-polish/SetupListWide.dc.html`: Guided setup list in a wide window.
- `canvases/13-polish/SetupWizardPhone.dc.html`: Guided setup wizard on a phone.
- `canvases/13-polish/SetupWizardWide.dc.html`: Guided setup wizard in a wide window.
- `canvases/13-polish/GuidancePhone.dc.html`: Guidance note in setup dialogs, on a phone.
- `canvases/13-polish/GuidanceWide.dc.html`: Guidance note in setup dialogs, wide.
- `canvases/13-polish/RailDevTools.dc.html`: Developer tools on the rail.
- `canvases/13-polish/MediaSearchPhone.dc.html`: Media search with the workbench, on a phone.
- `canvases/13-polish/MediaSearchWide.dc.html`: Media search with the workbench, wide.
- `canvases/14-decisions/PhoneReach.dc.html`: Search, accessibility and New tab on a phone.
- `canvases/14-decisions/PhoneTabs.dc.html`: Open pages on a phone, with one hand.
- `canvases/14-decisions/PickTouch.dc.html`: Choosing an element by touch.
- `canvases/14-decisions/AlertReplacements.dc.html`: Replacing the browser's blocking boxes.
- `canvases/14-decisions/TwoStepPhone.dc.html`: Two-step confirmation on a phone.
- `canvases/14-decisions/LocksMore.dc.html`: Locks still to build, part 1.
- `canvases/14-decisions/LocksMore2.dc.html`: Locks still to build, part 2.
- `canvases/14-decisions/WorkbenchMore.dc.html`: Pattern workbench, gaps against the reference tool.
- `canvases/14-decisions/SettingsMore.dc.html`: Settings controls still to build.
- `canvases/15-site/SiteWide.dc.html`: Project page, wide, light.
- `canvases/15-site/SiteWideDark.dc.html`: Project page, wide, dark.
- `canvases/15-site/SitePhone.dc.html`: Project page, phone, light.
- `canvases/15-site/SitePhoneDark.dc.html`: Project page, phone, dark.

### The project page

`docs/site/index.html` is the live page, generated from `p_site.py` with the same markup as the
`15-site` boards. It loads nothing from other sites: the typeface is served from `docs/site/fonts`
and the pictures are crops of `docs/screenshots`. `.github/workflows/pages.yml` publishes it to
GitHub Pages on every change under `docs/site/`. Pages must be set to "GitHub Actions" as its
source in the repository settings once.

### Review record

Every board was rendered and read. Fixed in review: the workbench title, tab row and footer were
cut at 320 px (now three tabs and More, the flags chip beside the mode switch, Copy and Export
under More); the hold ring and its status covered the cards; the lock wizard panel was clipped in
its window; the keypad's second text button ran off the screen; sheets slid under the bottom
bar; the open pages search was squeezed by New tab; the project page headline ran under its
picture and overflowed at 360 px.

Open after this pass:

- The audit counted 22 browser boxes; the code has 18 calls today. The board lists the 18.
- The QR code on the locks board is a labelled place; the app draws it from the secret.
- Cantonese copy on the new boards needs a native review.

### The project page, redrawn (10 November 2026)

The first project page was too thin. It is now an app-like page that carries every feature the
project owes a project page (69, checked by a hand-written list in `docs/site/check_site.py`),
each with its own article and its honest state in the product.

- `docs/site/index.html`, `app.js`, `app.css` and `data.js` (written by `build_site.py`) are the
  page. It runs in the browser only and requests nothing outside its own folder.
- The four first boards on `15-site` are replaced by 14 boards drawn from the live page by
  `source/pages/site_boards.py`: Home light and dark, Features, an article, Settings, Tools, the
  palette, the element menu, the appearance editor, the pattern workbench, a lock's keypad, and
  three phone boards (light, dark Settings, and English and Cantonese together).
- Open: Cantonese covers the page's own labels and messages; the 69 articles are English, and the
  page says so in Cantonese mode. The QR code for one-time codes is still to build.

### Deploy Assistant (10 November 2026)

`canvases/16-deploy-assistant` holds 15 boards drawn from the Deploy Assistant's own window by
`source/pages/deploy_boards.py`, in demo mode. The app is in `deploy-assistant/`; its page is built
from the shared parts of the project page, so both keep one design. The project page gains three
tabs: Deploy Assistant (downloads and a live demo of its window), Status (the status page) and a
Design gallery of every board, so nothing on it links away except downloads.

Version 1.1 of the app replaces the Deploy tab's landing-page cards with a two-pane wizard: the
places it can run on the left, and on the right the plan for the chosen place, already filled in and
editable, a four-step bar (Choose where, Check, Deploy, Open) and one Deploy button (Ctrl Enter). It
adds Extensions (a manifest per folder, permissions asked for and asked again when they change, a
separate process with time and size limits, no secrets handed over, two built-in extensions),
Tools, Support, Changes, school mode, a reading voice, a dark theme on a schedule, its own name
and logo, the dim sum surprise, background updates on Windows with an unsigned-update banner, the
version and build time on the first screen, and opening an instance's Compose file in VS Code. The
boards now fill `canvases/16-deploy-assistant` (15) and `canvases/17-deploy-assistant-more` (10).
