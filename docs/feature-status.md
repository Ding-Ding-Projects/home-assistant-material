# Feature status

What exists today, stated plainly. Every row starts with one of these words, followed by one
sentence of evidence and where the code lives.

| State | Meaning |
| --- | --- |
| Built and seen in a running build | The feature was opened or driven in a running instance (a published image, a container made from these files, or the frontend served from this repository). |
| Built, exercised on a running copy | A server part whose commands were really driven on a running copy; no interface was involved, or the interface was not seen. |
| Built, not yet seen in a running build | The code is in the repository and passes lint, the type check and unit tests where they exist, but nobody has opened it in a running build. |
| Partly built | Some of the board or contract is built; the row says what is missing. |
| Designed | Only a board exists in `design/`. |
| Not started | Nothing exists, not even a board. |
| Not applicable | The product has no use for it. |

A "seen" claim for work done on 10 November 2026 is limited to the list directly below. Rows
that were seen working in an earlier pass keep their screenshot named in the row; changes made
since then to the same feature are stated as not yet seen.

## Seen or driven in a running build on 10 November 2026

- The About page.
- The first-run Welcome screen (it still showed upstream items: a cloud restore and outside
  links; the fix is in source and has not been seen).
- The dashboards settings page and its Add dashboard dialog, at phone width.
- Dashboard edit mode on a dashboard that had been created.
- "Edit cards and layout" on Overview making an editable copy, at phone width: the confirmation,
  the question about the default page and the copy opening. Opening the copy straight in edit
  mode was broken and is fixed in source; the fix has not been seen.
- The welcome banner covering the Overview header at phone width. The fix is in source; it was
  confirmed live only by applying the same rule inside the open page.
- Google setup server commands: status, and a bad key refused without being echoed or logged.
- Dashboard history server commands: two saves, history, restore, and deleting an archived history.
- Passkey server tests: 143 passing in a running copy. No real authenticator was used.
- The four, then five, new integrations (passkey, Google setup, dashboard history, Minecraft
  manager, Ollama suite) loading at start without errors.

Everything else built on 10 November 2026 is "not yet seen in a running build".

## Seen in a running build on 11 November 2026

Seen in build 2026.11.1.96, on a throwaway copy, at 390 px wide:

- The Marketplace list scrolls with its group header pinned at the top. Before the fix the list
  opened a blank band and showed the group name twice (commit `f86ff751a`).
- On the Personal settings page the preview scrolls away and only the group chips stay pinned.
- The accessibility panel's rows no longer overlap. In that build its text size "+" button wrapped
  onto its own line; the fix for that is in batch 19 and has not been seen.

Everything else added in batches 18 and 19 and in the dashboard tools commit is "not yet seen in a
running build" unless the next section lists it, including the "Add media" fix reported broken on
an iPhone (fixed in source only).

## Seen in a running build on 11 November 2026, builds 103 and 106

Seen in build 2026.11.1.103, on a throwaway copy, in a headless browser at 390 px wide, signed in
with a generated test account:

- The file converter: its categories show Ready and none shows "Unavailable".
- The support page.
- The Minecraft servers page with no server (its empty state).
- The profile security page with the authenticator card.
- The Ollama page with no server (its empty state).
- The updates page.
- Media sources.
- The dashboard history overview, with its search field and correct plural forms. One defect was
  seen there (a tab's version count wrapped onto two lines); it is fixed in commit `5fbf6d91b` and
  the fix has not been seen.
- The voice assistants page, with no promotion of the paid cloud service.

Seen in build 2026.11.1.106 the same way: the Permanent record page (status Recording, counts, one
day listed).

Seen on the hosted instance (build 106) by running it, not in a browser: the activity record
created its repository and its first day file.

Seen or run for real on 11 November 2026, in build 106 on a throwaway copy with a headless
browser at 390 px wide: the expanded menu's rows measure 48 px; in the media Manage dialog
pressing "Add media" opened a file chooser, an uploaded picture was listed and was on disk,
and a new folder was created; the version picker opened, listed the versions and a chosen
version produced a compare. The Ollama pages and test chat were run against a real Ollama
server, and the Minecraft manager against a real SSH and Docker host (a throwaway container
with its own Docker engine); see their feature pages. That run found the Paper version list
address retired by its service, fixed in batch 24.

Seen or run for real on 11 November 2026 in build 109, at 390 px wide with a headless browser:
the save bar in the automation, script and scene editors (Saved, Unsaved changes, Saved);
schedules (a rule made, applied and kept after a reload); the converter (zip, tar, gzip, PDF,
DOCX and WAV conversions each produced a real file); the embedded page panel's reload and its
slow-page notice; a finished entry in the activity tray with Open, Undo and Dismiss; the Ollama
models table scrolling sideways with no word broken, and a download failing cleanly when the
server was stopped part way; passkeys with a browser virtual authenticator (add, sign in
without the password, remove, clean failures); Enter confirming the New folder prompt; and the
Minecraft version lists refreshing for real, with vanilla 1.21.8 starting.

Not seen in any browser, as of build 109: the "Add media" fix on a real phone; the update install progress and
recovery card during a real install (no real update has been available); and an activity tray
entry while it is still running. The three batch 25 changes were run in build 111 on a throwaway
copy: through the manager on a real SSH and Docker host, vanilla 26.3 and Paper 26.3 started on
the Java 25 image, 1.21.8 on Java 21, 1.20.1 on Java 17 and 1.16.5 on Java 8, each with the
server's own "Done" line and the right image named on its page; with the Ollama server stopped
the Models section said no server is answering, and listed models again once it was back; the
"Page not showing?" button showed its explanation on a page that refuses framing, Dismiss and
Reload cleared it, and the toolbar fitted at 390 px wide.

## What was checked for batches 20 to 23 (commits `d68fda3b1`, `88b36b5d8`, `ba7a6a431`, `e0f2d7235`, `5fbf6d91b`)

Checked, and how:

- The frontend type check is clean.
- 5,401 frontend tests pass; the baseline of 3 failing tests and 46 test files that do not load is
  unchanged.
- Server tests in a Linux container: activity record 124 passed, automation and dashboard history
  157 passed, media source 141 passed, Ollama 88 passed. The media source tests were seen failing
  against the old code (19 failures) before the folder fix.
- The activity record was run on a throwaway copy across two restarts: it kept its first-version day
  file, wrote the new chunk and committed at shutdown. On the hosted instance it created its
  repository and first day file.
- Builds 102 and 105 were skipped on purpose: 102 lacked the media folder safety fix and 105 had the
  first version of the activity record.

Not checked: see the list of what has not been seen in any browser in the section above. The
activity record can still lose entries in the ways `docs/features/activity-record/README.md` lists,
and the operating system image was built in build 109 after the two unit files were renamed (the generic virtual machine image and the Raspberry Pi 3 image; the Raspberry Pi 4 and 5 jobs of that build were cancelled by a newer push), and the build log shows both mount units enabled under their real names; that image has not been booted.

## What was checked for batches 18 and 19 (commits `8fa63f05d`, `f86ff751a`, `0d056629e`)

Checked, and how:

- The frontend type check is clean.
- 5,337 frontend tests pass; the baseline of 3 failing tests and 46 test files that do not load is
  unchanged.
- Server tests in a Linux container: media source 109 passed and Ollama 88 passed (batch 19);
  earlier on 11 November: passkey 143, Minecraft manager 217, frontend storage 36, automation and
  dashboard history 157.

Not checked:

- Update install progress and the recovery card, the Minecraft server page, Ollama unload, model
  details and test chat, the support page and bundle, the save bar in the automation, script and
  scene editors, the embedded page panel changes, media folder management, the "Add media" fix,
  the image upload button, hiding of the paid cloud service in the interface (the server
  integration is unchanged, by the owner's instruction), the new converter formats, the history
  search and version picker, the "Git remote" wording and the Cantonese additions.
- The "+" button fix in the accessibility panel (batch 19).
- The dashboard tools dialog (commit `cbefeaf48`, unit tests of its editing functions only).
- The operating system image was built in build 109 after the two unit files were renamed (the generic virtual machine image and the Raspberry Pi 3 image; the Raspberry Pi 4 and 5 jobs of that build were cancelled by a newer push), and the build log shows both mount units enabled under their real names; that image has not been booted.

## What was checked for the last batch of 10 November 2026 (commits `5b2c6af85` and `0d9dc73d4`)

Checked, and how:

- 623 server tests pass in a Linux container: passkey 143, Minecraft manager 217, Ollama suite 70,
  frontend storage 36, automation and dashboard history 157.
- The frontend type check is clean. 5,093 frontend tests pass; the baseline of 3 failing tests and
  46 test files that do not load is unchanged from before this batch.
- The production frontend container build completes with the processor cap.
- A plain `git clone` checks out on Windows 11.
- The changed server integrations load without errors in a running copy.

Not checked:

- None of the pages and components of that batch has been opened in a browser: the authenticator
  card, the activity tray and recovery card, schedules and shared defaults for personal settings,
  the information buttons, split panes and the filter pane resize, starting points for empty
  editors, appearance and wording saved to the instance, the changes to the import summary, and
  the archive list on the history pages.
- The operating system image was built in build 109 after the two unit files were renamed (the generic virtual machine image and the Raspberry Pi 3 image; the Raspberry Pi 4 and 5 jobs of that build were cancelled by a newer push), and the build log shows both mount units enabled under their real names; that image has not been booted.
- The new release workflow jobs have not run: attaching the Deploy Assistant, withdrawing a
  release that has no files, and publishing no release for a documentation-only push.
- `deploy-assistant\build.bat` was added by another lane and was not run by this work.
- The build fix has been run on one computer only; a second computer has not tried it.

## Product

| Feature | State | Evidence and where |
| --- | --- | --- |
| Upstream sources in one repository | Built and seen in a running build | The published images are made from it; the pinned releases are listed in `UPSTREAM.md`. |
| Release on every push that changes the product, with a unique tag | Built and seen in a running build | Build 1 was verified through its container image; `.github/workflows/release.yml`. A push that changes only documentation or design files now publishes no release (see the next row). Before that, every push published one, which left 37 releases with no files at all; they existed because a push that built nothing still created a release and its tag. They were removed. |
| Release workflow: attach Deploy Assistant, withdraw an empty release | Built and seen in a running build | Observed: every release now carries the Deploy Assistant installers (seen on v2026.11.1.88, .91 and .93), and runs replaced by a newer push are cancelled and leave no release. The installers are copied straight after the release is created, so a new release page is not empty while the long builds wait (commit `3ce9e087a` records this; the message of `b64779d75`, which made the change, belongs to another project). A release is withdrawn when no build job of its own attached a file. 37 empty releases were removed by hand. Not observed yet: a documentation-only push publishing no release. |
| Release workflow: documentation-only pushes and the comparison with the last published images | Built and seen in a running build | Observed on 11 November 2026: a documentation-only push (run 112, 11 November 2026) finished without publishing a release, as intended. Builds 64 and 65 were published without images because a push that changed many files was mistaken for a documentation-only push; the workflow now compares with the build that last published images (`.github/workflows/release.yml`, the version step), and no push since has shown the new comparison working. Build 66 is the first with images again. |
| Container image for amd64 and arm64 | Built and seen in a running build | Publicly pullable and run from the registry (see the table below). |
| Core, machine, landing page and supervisor images | Built and seen in a running build | Built in build 1; the core image has been run many times. The others were built and published; only the core was driven. |
| Update feed and updater pointed at this project | Built, not yet seen in a running build | The feed is live (`channel` branch); an update between two builds has not been observed. `docs/material-changes.md`. |
| Operating system images: Raspberry Pi 3, 4, 5 and VirtualBox | Built and seen in a running build | `haos_ova-18.5.33.ova` started on VMware Workstation on Windows 11: it took a network address, finished its first start and showed first-run setup on port 80, reached from a second device (`ovftool` needs `--skipManifestCheck`, see the README). It has not been booted in VirtualBox or on a Raspberry Pi. |
| Plain `git clone` on Windows | Built and seen in a running build | Two systemd mount units whose names contain a backslash are stored as `__x2d__` and the operating system post-build script renames them back, so a clone checks out on Windows 11 (seen). The rename was seen in the operating system build of build 109 (generic virtual machine image and Raspberry Pi 3): the build log shows both mount units enabled under their real names. That image has not been booted (`operating-system/buildroot-external/scripts/post-build.sh`, `README.md`). |
| Local frontend build on a machine with many processors | Built and seen in a running build | The frontend container compile is held to four processors (two on a retry) and the minifier worker count follows it; the build context no longer carries the host's `node_modules`. On Windows 11 with 32 processors the build crashed before this and produced the wheel after it; the production container build completes. Seen on one computer only (`build/frontend.Dockerfile`, `frontend/build-scripts/rspack.cjs`). |
| Hosted instance on the owner's network | Built and seen in a running build | Runs build 2026.11.1.106. Builds 88 and 91 were skipped on purpose: they contained a defect where settings saved on the instance could cross between two accounts on one browser, fixed in batch 18 (see the row on appearance and wording saved on the instance). Builds 102 and 105 were skipped on purpose too: 102 lacked the media folder safety fix and 105 had the first version of the activity record. |
| Operating system updates over the air | Built, not yet seen in a running build | Wired; the two signing secrets are set since 10 November 2026. No build has finished its operating system images since, and no update between two such builds has been watched. |
| `build.sh`, `build.bat`, `build-installer.bat`, dependency installers | Built, not yet seen in a running build | Written at the repository root; not run end to end. `deploy-assistant\build.bat` (builds the Deploy Assistant installer on Windows) was added by another lane and has not been run. |
| Deploy Assistant (`deploy-assistant/`, version 1.3.0) | Partly built | Docker on this computer was run end to end in a test on 10 November 2026: two instances side by side, a backup, a restore and a removal; the card writer wrote and read back a test image through the packaged app. Versions 1.1 to 1.3 add the two-pane deploy wizard, extensions, offline project pages, QR scanning, an update self-test, ADHD modes, a narrator, schedule rules, two-key confirmation, logo upload, exports in eleven formats, record history and a live chart; they were checked in the browser demo and in Electron on Linux. Not seen on Windows or macOS hardware, auto-update has not been seen applying a real release, and SSH hosts, VirtualBox, VMware and a real card are not seen working. `deploy-assistant/FEATURES.md` lists every contract feature, including those not started (virtual disks, game servers, local models, drawing). Open review findings are in `HANDOFF.md`. Later commits by another lane (not run or seen by this work) add a Convert tab (PDF, images, ZIP, data and text), a Base64 toolkit, a QR maker, a ZIP of every export, a drawing tab, shared School mode with an unlock ladder, Windows Snap layouts and an extension manager. |
| Dedicated build application | Not started | Nothing exists in the repository. |
| Project website | Built and seen in a running build | Published on GitHub Pages; `docs/site/check_site.py` opened it in Chrome at 1440 and 360 px: twelve tabs open by default, including the Deploy Assistant with its downloads and a demo of its window, the status page and every design board. Nothing links away except downloads. `docs/site/`. |

## Checked in published images

Published images have been pulled from the registry and run, not only built:

| Build | What was checked in the running image |
| --- | --- |
| `2026.11.1.26` | Starts, first-run setup completes, the interface loads; the pattern workbench on the Entities table; `host.sh` end to end |
| `2026.11.1.29` | The version shown is 29; the menu on an element and the appearance tools; the private vocabulary card |
| `2026.11.1.32` | The automation repositories integration is built in and answers (no custom integration); the release has the VirtualBox image and the Raspberry Pi 3, 4 and 5 images |
| `2026.11.1.35` | The breadcrumb, the large title with its count, rows as cards and the export button are in it |
| `2026.11.1.38` | Run with a small demo home: the Home greeting and its sentence, the settings home grid with live counts, the compact rail, and the row of tools in an entity dialog are in it |
| `2026.11.1.46` | Started on Windows 11 by `host.bat --detached` with nothing but its configuration folder: healthy, the first-run setup answers, and it was reached from a second device on the network. The features added after build 38 were not checked in it |
| `2026.11.1.34` | Run with only its configuration folder mounted (`docs/screenshots/published-34-export.png`): the page tools, the tools panel and the footer are in it; a CSV export downloaded, a page locked and unlocked by a hold, a PIN was set and the wait after three wrong PINs was shown, and the help articles opened |

The history manager page was checked with the frontend served from this repository on the
build 32 image. Work added on 10 November 2026 after build 66 has been checked only as listed in
the section above.

## Interface

| Feature | State | Evidence and where |
| --- | --- | --- |
| Material Design 3 shell: rail, pane, pill tabs, tokens | Partly built | Colour scales, surfaces, typeface, navigation rail, floating pane, borderless cards and pill tabs are in the frontend and were seen in its demo build (`docs/screenshots/`). Not built: the dark theme check on every page, motion tokens. See Home greeting and Phone layout rows. |
| Activity: permanent record | Built, exercised on a running copy, page seen in a running build | A new integration writes everything the Activity page shows to a Git repository in the configuration folder, one folder of chunk files for each day (about 1 MB each, so a commit stores only the small active chunk), committed in batches (every ten minutes by default and at shutdown) and never purged, rewritten or squashed. It takes entries from the logbook's own live stream, so it records what the page shows and leaves out what the page leaves out. A write that fails goes back to the front of the queue and is retried; a bad entry becomes a line saying so; a drop is counted only on a real overflow and kept on disk; a deleted or edited day file is restored from the last commit with a copy of the edited file kept beside it; a key for a Git remote lives outside the repository; a second instance on the same folder is refused. The Permanent record page lists the days, shows a day, searches one day or all days and holds the Git remote settings; nothing leaves the instance unless an administrator sets a remote and pushes. It grows for ever by design and the folder is included in backups. Verified: 124 server tests pass in a Linux container; on a throwaway copy it kept its first-version day file, wrote the new chunk and committed at shutdown across two restarts; on the hosted instance (build 106) it created its repository and first day file; the page was seen in build 106 at 390 px wide (status Recording, counts, one day listed). Known limits: it can still lose entries (a power cut in the seconds before a flush, a real queue overflow, shutdown while the disk is failing); it does not import entries from before it started; searching, a long history and a push to a real remote have not been seen in a browser or against a real remote host. `core/homeassistant/components/activity_record/`, `frontend/src/panels/config/activity-record/`, `docs/features/activity-record/README.md`. |
| Smaller rows in the expanded menu | Built and seen in a running build | Seen in build 106 at 390 px wide, rows measured 48 px. Rows in the expanded menu are 48 px, down from 56 px, so the whole menu fits a phone screen; the collapsed rail keeps 56 px (`frontend/src/components/ha-sidebar.ts`). |
| Dark theme | Partly built | Home, Settings home, Devices and the Base64 toolkit were seen in the dark colour scheme (`docs/screenshots/dark-theme.jpg`). Other pages and the boards' own dark versions are not checked. |
| Motion with a reduced-motion path | Partly built | Reduced motion is honoured by the accessibility tools, the personal settings and the automation editor's motion (`frontend/src/panels/config/automation/motion-styles.ts`, `motion-helpers.ts`); the board's motion tokens are not built, and none of it was seen moving in a running build. |
| Live charts | Designed | Board `Energy`; nothing built beyond upstream charts. |
| First-run setup (wizard, review, password strength, date and unit preview) | Built, not yet seen in a running build | `frontend/src/onboarding/`: three steps, password strength, a preview of dates and units, a review step, no cloud restore and no outside links, and nothing contacts an outside map service until a button that says so is pressed. The Welcome screen was seen on 10 November showing the old upstream items; the fix is in source and unseen. Open: the location step's lookup behind a confirmation dialog, the integrations step is not interactive, and a review found that a failed flow can leave both buttons off (see `HANDOFF.md`). |
| Setup wizards: guided setup, lock wizard, Google setup, backup setup | Built, not yet seen in a running build | Each has real controls, live validation, a review of what will be written and Back and Next (`frontend/src/panels/config/guided-setup/`, `frontend/src/components/locks/ha-lock-wizard.ts`, `frontend/src/panels/config/google-setup/`, `frontend/src/panels/config/backup/dialogs/dialog-backup-onboarding.ts`). Whether each wizard has save and resume, jump to a step and a test of the new value has not been confirmed. |
| Language modes (English, Cantonese, both) | Built, not yet seen in a running build | `frontend/src/common/language-mode/`; Cantonese copy for this project's own surfaces is in `frontend/src/translations/yue-own.json` (tabs, the search of everything, the phone bar, locks, the wording card and Personal settings). Cantonese for pages not written by this project is not written. Checked by unit tests only. |
| Playfulness levels | Built, not yet seen in a running build | Two sliders in Personal settings change real messages (`frontend/src/common/playful/playful-text.ts`). |
| Dialog emoji switch | Built, not yet seen in a running build | A switch in Personal settings; dialogs that provide an emoji show one (`frontend/src/dialogs/generic/dialog-box.ts`, `common/preferences/personal-preferences.ts`). |
| School mode | Built, not yet seen in a running build | A switch with rules that each have an effect, and a name (`SCHOOL_RULES` in `frontend/src/common/preferences/personal-preferences.ts`). The shared switch across other apps and an unlock credential are not built. |
| One thing at a time | Built, not yet seen in a running build | `frontend/src/common/preferences/one-thing.ts`, a switch in Personal settings. |
| Attention modes | Built, not yet seen in a running build | A small clock, and an offer to go back to the last page (`frontend/src/common/preferences/attention-modes.ts`); also the focus spotlight and low stimulation. |
| Spoken narrator | Built, not yet seen in a running build | Off by default; it reads the name of the focused control and uses only a voice that runs on the device, and stays silent when there is none (`frontend/src/common/narration/`). Cantonese speech needs a Cantonese voice on the device. Unit tests only. |
| Action sounds | Built, not yet seen in a running build | Sounds with volume and quiet hours, applied at start (`frontend/src/common/sound/action-sound.ts`). |
| Private vocabulary file and drop to apply | Built and seen in a running build | A card on Profile, Localization chooses, replaces or clears a JSON file (schema version 1, up to 256 KiB, UTF-8), or a file can be dropped anywhere in the window. The file is checked in full first and a refused file changes nothing; wording applies only where text is localized, so addresses, paths and identifiers stay literal; nothing is sent anywhere. Seen: an invalid file refused, a 324-entry file loaded, labels on Settings changed and still in place after a reload. `frontend/src/common/vocabulary/`, 31 unit tests. The file is now also saved on the instance for the signed-in account (see the row on appearance and wording saved on the instance; not seen). Changed since, not yet seen: a key in small letters also matches a capital-first word, the celebration and its sounds, and text that carries links keeps the wording on its plain parts. Not built: an entry in the command search. |
| Scheduled and external settings sources | Partly built | Built, not yet seen in a running build: time rules for personal settings and shared defaults for every signed-in person (`frontend/src/common/preferences/preference-schedule.ts`, `preference-schedule-store.ts`, `shared-preference-defaults.ts`, `frontend/src/panels/config/personal/ha-personal-schedules.ts`, `ha-personal-shared-defaults.ts`; unit tests). Not built: triggers from an entity or a web service. Board `Schedule`. |
| Renaming the app and logo customization | Built, not yet seen in a running build | Settings, name and logo (`frontend/src/panels/config/identity/`, `frontend/src/common/identity/`); About keeps the product name. Since the last batch the logo's pixel size is read from its header before it is used and the server caps the stored value (unit tests, not seen). |
| Appearance and personal wording saved on the instance | Built, not yet seen in a running build | Appearance choices and the personal wording file are stored for the signed-in account on the instance, with the browser copy kept as a cache, and are included in backups (`frontend/src/common/instance-sync/`, `frontend/src/common/appearance/appearance-sync.ts`, `frontend/src/common/vocabulary/wording-sync.ts`, `core/homeassistant/components/frontend/storage.py`). Server storage tests (36) and frontend sync tests pass; a second computer picking the choices up, and a restore from a backup, have not been tried. Batch 18 ties the saved settings to the signed-in account: a browser cache that belongs to another account is cleared before anything is shown or uploaded, and a cache from before the feature is claimed once (unit test of the first frame; not seen with two accounts in one browser). A personal setting a person chose is kept even when it equals the default; picture layers may only be embedded images or paths on this instance; a hostile appearance value can no longer write onto shared prototypes (unit tests). |
| Dim sum surprise | Designed | Board `DimSum`; built only in the Deploy Assistant. |
| Per-element appearance editor | Built and seen in a running build | Any element can be picked by the menu, Ctrl+Shift+E or the pick tool; fill layers, text, corners, border, shadow, accent, size and opacity; saved in the browser, and now also on the instance for the signed-in account (see the row on appearance and wording saved on the instance; not seen) (`docs/screenshots/appearance-editor.png`, `appearance-pick.png`; `frontend/src/common/appearance/`, `components/appearance/`; 16 unit tests). Not seen: inside a modal dialog, on a phone, with the keyboard only. Not built: masks, per-state layers, picture filters, export and import. Added since and not seen: the editor's own colour picker (`ha-appearance-color-picker.ts`). |
| Colour picker and translator | Partly built | The Colour tab was seen in a running instance (`docs/screenshots/colour-tool.png`). Since then a typed colour is applied when typing ends and a drag is stored a few times, not at every move (not seen). The board's named palette, gamut chips and animated rainbow are not built. |
| Fonts and type scale | Partly built | A fonts dialog lists only typefaces that ship with the app or are on the device (`frontend/src/components/appearance/ha-appearance-fonts.ts`); not seen in a running build; the type scale board is not built. |
| Accessibility tools | Built and seen in a running build | Panel on wide screens: text size, contrast, reduced motion, focus ring, larger targets, keyboard help, reset (`docs/screenshots/accessibility.png`, `contrast.png`). Added since and not seen: line spacing and letter spacing, narrow-screen and focus fixes. Read aloud is built and now uses only an on-device voice; not heard working. No button on a phone yet; Alt+A works there with a keyboard. |
| Resizable panels, collapsible filters and statistics | Partly built | Built, not yet seen in a running build: split panes with a keyboard-usable divider, and a filter pane that can be resized on the shared list layout (`frontend/src/components/layout/ha-split-panels.ts`, `ha-split-divider.ts`, `split-panels-logic.ts`, `frontend/src/layouts/hass-tabs-subpage-data-table.ts`; unit tests of the sizing logic). Not built: collapsible statistics. Board `Panels`. |
| Tabs open by default and the New tab catalog | Built and seen in a running build | Seen in the demo build (`docs/screenshots/tabs.png`, `tabs-bulk-close.png`); the catalog search accepts patterns and bulk close with Undo works. Added since and not seen: dragging into a new order, pinning, the order and pins kept in page history, the phone sheet following the order, the tools listed in Open a tab, screen reader and keyboard fixes, and the search shrinking to a button on a narrow screen (`frontend/src/components/ha-page-tabs.ts`). Not built: separate searches per group. |
| Phone layout: bottom bar and sheet of open pages | Built, not yet seen in a running build | `frontend/src/components/phone/ha-phone-bar.ts`; a bar at the bottom (Home, Search, Pages, Access, Menu) and a slim bar at the top. The bar hides on scroll only on pages that scroll the window. |
| Command palette on Ctrl+Shift+F | Partly built | The quick bar opens from the Search button (seen in the demo build); the key press is not seen, because the demo build does not register shortcuts. |
| Search of everything | Built, not yet seen in a running build | Lists settings and switchable entities with a live switch in the row (pointer only, not yet from the keyboard) and key hints; works for people who are not administrators (`frontend/src/common/search/`, the command palette). |
| Pattern workbench on every search | Built and seen in a running build | 38 search fields (listed in `frontend/src/common/regex/search-surfaces.ts`) have a workbench button and accept `/pattern/flags`; a test fails when a field is added without an entry. Seen on the New tab catalog in the demo build and on the Entities table in the published build 26 (`docs/screenshots/pattern-workbench.png`, `pattern-search.png`). Not seen: filter panes, pickers and logs (unit tests only). |
| Automation tests: every condition and every Choose option | Built and seen in a running build | A test button on each condition and each Choose option (`docs/screenshots/automation-option-test.png`). Since then not seen: the Choose step can test and run one option, the default actions or the whole step, a disabled condition is left out of a test, old results clear when the step is edited, an impossible option is marked, and Run asks first (`frontend/src/panels/config/automation/option/`, `run-helpers.ts`). |
| Automation editor: motion, status bar, enable switch | Built, not yet seen in a running build | Three named cards; cards open and close smoothly, new steps slide in, results fade in, with reduced motion respected; an on and off switch, a Check button and a history strip (`frontend/src/panels/config/automation/ha-automation-status-bar.ts`, `motion-styles.ts`, `motion-helpers.ts`). Review findings still open (see `HANDOFF.md`). Not built: the bottom bar, a dry run of the whole automation, the repository strip. |
| Script editor | Built, not yet seen in a running build | Redrawn with a mode selector, Run now and See past runs (`frontend/src/panels/config/script/ha-script-editor.ts`). Open: Save in a bottom bar needs the shared editor mixin, and `fields_empty` is unused. |
| Run now for automations and scripts | Built, not yet seen in a running build | Says that the saved version runs, asks first, reports the result, and is off while there are unsaved changes (`frontend/src/panels/config/automation/run-helpers.ts`). |
| A Git repository for each automation, and a master repository | Built and seen in a running build (changes since not seen: see the history row) | See `docs/automation-repositories.md`: every save commits; Commit everything commits each changed automation, then the master, and pushes where a remote is set; 20 tests with real Git; seen in a running instance. Not checked: a push to a real remote host. Not built: the per-automation repository page, the repository strip, remote settings in the interface, pull, scripts and scenes. |
| Backups carry the automation repositories | Not started | Only read so far: neither exclude list names `automation_repos/`. No backup has been made and restored to prove it (`HANDOFF.md`, item 1). |
| Automation history manager | Built and seen in a running build | A History tab lists every version with test one, test many, run many with confirmations, compare and commit everything (`docs/screenshots/automation-history-run.png`, `automation-history-compare.png`). Not seen: make live, export, Stop during a long test, a narrow screen. Not built: named test cases, a simulated run. Automations now link to their history (not seen). Changed in the last batch and not seen: a missing, empty or truncated automations file can no longer set aside every history, archived histories can be listed and brought back, unchanged automations start no Git process, and a push sends only the ticked repositories and asks first (automation and dashboard history server tests, 157 together, pass). |
| Context menus with working shortcuts | Partly built | Seen (`docs/screenshots/element-menu.png`, `element-menu-page-tools.png`): filter, arrow keys, edit appearance, reset, read aloud, copy, search, commands, plus export, history and lock for the page. Since then not seen: Open and Open in a new tab on a link, and the phone sheet. Not built: entries specific to what was clicked (turn off, rename, hide). |
| Guided forms and per-control information buttons | Partly built | The information buttons are built and not seen (`frontend/src/components/setting-info/ha-setting-info.ts`). Not built: the board's worked example and the practise control. Board `GuidedForm`. |
| Settings that explain themselves | Partly built | Personal settings says what each control reaches and has a reset (not seen); information buttons beside settings are built as a shared component (`frontend/src/components/setting-info/ha-setting-info.ts`, not seen). The board for other pages is not built. |
| Extension support | Designed | Board `Extensions`; built only in the Deploy Assistant. |
| Starting points for blank editors | Partly built | Built, not yet seen in a running build: starting points offered in an empty template editor and in an empty dashboard sections view (`frontend/src/components/starting-points/`, `frontend/src/panels/config/tools/template/tools-template.ts`, `frontend/src/panels/lovelace/views/hui-sections-view.ts`; a unit test of the template list). Not built: starting points in other empty editors, such as an empty automation or script. Board `BlankEditor`. |
| Two-key confirmation | Built and seen in a running build | 104 destructive questions show two keys and a slider; seen deleting a throwaway automation (`docs/screenshots/two-key-confirmation.png`). Since then not seen: eleven more destructive actions use it, and fifteen of the browser's own blocking boxes are replaced by messages and dialogs. |
| Page tools in every page header | Partly built | Search this page, Edit appearance, Read aloud, History, Export, Lock and Help on the two shared page layouts, with a footer line (seen, `docs/screenshots/page-tools-find.png`). Dashboards have the footer, the lock and menu entries, but no header cluster. |
| Home greeting | Built and seen in a running build | Greeting, one sentence made from what the instance reports, scene buttons and large cards (`docs/screenshots/home-greeting.png`). The board's power card is not built. |
| Settings home drawn like its board | Built and seen in a running build | Large title, search of sections, banners and a grid of cards with live counts (`docs/screenshots/settings-home.png`). The board's cards for appearance, language and locks have no page to open yet. |
| System page drawn like its board | Built and seen in a running build | `docs/screenshots/system-page.png`. Processor, memory and temperature figures are not shown because a plain container does not report them. |
| Rail and top bar | Built, not yet seen in a running build | Compact rail by default, a language button and the user's picture in the top bar, an Assist button at the top of the rail (`frontend/src/components/ha-sidebar.ts`, `ha-page-tabs.ts`); the compact rail was seen in build 38. |
| List pages drawn like their boards | Partly built | Seen on Devices (`docs/screenshots/list-page-devices.png`): large title with a summary line, rows as cards, export button. Since then not seen: filter chips beside the search, a tick box on every row and a line under the list on Devices and Entities. Automation rows have no second line. |
| Dialog tools | Built and seen in a running build | Search this dialog, Edit appearance and Lock at the foot of every dialog except a plain question (`docs/screenshots/dialog-tools-find.png`, `dialog-tools-locked.png`). Not on the sheets that replace dialogs on a phone. The entity dialog no longer repeats the lock and appearance tools (not seen). |
| Search this page | Built and seen in a running build | Marks matches through component boundaries; plain text or `/pattern/flags` (`frontend/src/common/page/find-in-page.ts`). |
| Page locks | Partly built | Seen working (`docs/screenshots/page-tools-lock.png`): a hold or a PIN unlocks. The shared PIN is still used for pages and dialogs. |
| Unlock ladder | Partly built | Seen: the third wrong PIN waits 5 seconds, then 15 seconds, 1 minute and 5 minutes. The board's other rungs are not built. |
| Locks on single elements | Partly built | Seen working with a hold (`docs/screenshots/element-lock.png`). Unlocking elements with the PIN is written but was not exercised. |
| Locks with their own credentials | Built, not yet seen in a running build | Six ways in (PIN, password, PIN and password, password and one-time code, PIN and one-time code, all three), a six-step wizard with a QR code, a prompt that counts down a wait, and a searchable list of locks (`frontend/src/components/locks/`, `common/locks/lock-credentials.ts`). Unit tests only. Not built: locks on tabs and appearance values, the support desk, QR code for the one-time secret in history. |
| Personal settings page | Built, not yet seen in a running build | Grouped, each control says what it reaches, with a search, quiet hours, a reset and the language and attention items above (`frontend/src/panels/config/personal/ha-config-section-personal.ts`, `common/preferences/`). |
| Guided setup for integrations without a setup screen | Partly built | Run in a container made from this repository's files: it starts and lists 240 integrations; 223 get drawn fields and 17 get one checked YAML box; two integrations were checked and saved through the interface's connection and wrote the expected files. The wizard, the saved file and the reload have not been seen in the interface. `core/homeassistant/components/guided_setup/`, `frontend/src/panels/config/guided-setup/`. |
| Google setup | Built, exercised on a running copy | Server commands were driven: `google_setup/status`, and a bad service account key refused without being echoed or logged. Enabling the needed services with a real key, the client file, the sign-in and the status of connected Google integrations are not exercised. `core/homeassistant/components/google_setup/`, `frontend/src/panels/config/google-setup/`. Nest registration guidance is not built. |
| Dashboards: Overview and other built-in pages made editable | Built and seen in a running build | Seen at phone width: the dashboards settings page and its Add dashboard dialog, edit mode on a created dashboard, and "Edit cards and layout" on Overview making an editable copy (confirmation, default-page question, the copy opening). Fixed in source, not yet seen: opening the copy straight in edit mode and the welcome banner covering the Overview header (the banner fix was confirmed only by applying its rule in the open page). `frontend/src/panels/lovelace/import-export/`, `frontend/src/panels/config/dashboard/`. |
| Dashboards: export, import by drop, import summary | Built, not yet seen in a running build | Export a dashboard; a dropped dashboard file shows outside addresses, custom cards and buttons that would call a service before anything is made; imports start hidden from the rail and visible to administrators only, with Undo (`frontend/src/panels/lovelace/import-export/`). Changed in the last batch and not seen: addresses are normalised the way a browser does before the host is shown, and toggles on locks and covers are listed (unit tests, including address forms and hostile files, pass). |
| Dashboards: history per dashboard and tab, remote and push | Built, exercised on a running copy | Every dashboard and every tab has its own Git repository and history page; the server commands for two saves, history, restore and deleting an archived history were driven in a running copy; 41 tests with real Git. The page, set remote and push are not seen; no push to a real remote. The archive list (list the histories of deleted dashboards, bring one back or remove it) is built on the history pages and not seen; a push sends only the ticked repositories and asks first (server tests pass, the page is not seen). `core/homeassistant/components/dashboard_repos/`, `docs/features/dashboard-history/README.md`. |
| Backups: encryption off by default | Built, not yet seen in a running build | A storage location that needs encryption is off while encryption is off, and a stored key is never replaced or removed without asking (`frontend/src/panels/config/backup/`). Review findings on the setup dialog are open (see `HANDOFF.md`). |
| Link confirmation | Built, not yet seen in a running build | A link that opens a page of the interface from outside asks first, shows where it goes and what it passes on, and does nothing until chosen (`frontend/src/panels/my/`). |
| Not-found screen | Built, not yet seen in a running build | Unknown pages under Settings show a not-found screen (`frontend/src/panels/notfound/`, `frontend/src/layouts/hass-not-found-screen.ts`). |
| Status screens: starting, connection lost, no access, loading, error | Built, not yet seen in a running build | Redrawn (`frontend/src/layouts/ha-init-page.ts`, `hass-error-screen.ts`, `hass-loading-screen.ts`). |
| Maintenance | Built, not yet seen in a running build | Opens with what needs you; counts one row per device (`frontend/src/panels/maintenance/`). |
| Offline help reader and bundled articles | Built, not yet seen in a running build | Every help link opens a copy inside the interface, on the sign-in page too; nothing opens a new tab. 40 articles, 1,392 integration pages and 189 images ship with the interface, with source and commit recorded; licence Creative Commons Attribution-NonCommercial-ShareAlike 4.0 with attribution to the Home Assistant documentation authors (`frontend/public/static/help/LICENSE-NOTICE.md`; `frontend/src/components/help/`; `frontend/build-scripts/sync-help-articles.mjs`). The Help tool with 12 articles was seen earlier (`docs/screenshots/page-tools-help.png`). Open review findings DD1 to DD10 (see `HANDOFF.md`). |
| Passkeys | Built, exercised on a running copy | Sign in with a fingerprint, face or security key on a secure address, beside the password; add and remove passkeys on the profile page; removal needs a recent password sign-in. The server tests, 143 passing, ran in a running copy; no real authenticator was used and the sign-in page and card were not seen. `core/homeassistant/components/passkey/`, `frontend/src/auth/ha-passkey-login.ts`, `frontend/src/panels/profile/ha-passkeys-card.ts`. |
| No data sent out, and a problem log instead | Built, exercised on a running copy | Analytics, crash reports, diagnostics and report buttons are removed. Started in a container from these files: it starts clean, first-run setup has three steps, and a forced error produced files and a commit in the problem log repository. The page that lists problems has not been seen. `core/homeassistant/components/problem_log/`, `frontend/src/panels/config/problem-log/`. The supervisor's own tests still expect the removed crash reporter and need rewriting. |
| Minecraft server manager: second slice | Partly built | Definitions, SSH hosts with a key made for each host and trust on first use, version lookup on request, and the Docker over SSH target for Java servers: start, stop, log and a reachability check (`core/homeassistant/components/minecraft_manager/`, `frontend/src/panels/config/minecraft/`, `docs/features/minecraft-server/README.md`). 217 server tests pass in a Linux container, exercised earlier against a throwaway SSH server; on 11 November 2026 build 106 was run against a real SSH and Docker host in a throwaway container (host trust, a real image pull and start, logs, stop, restart, every refusal, a changed host key) and the pages were seen; that run found the Paper version list address retired, fixed in batch 24. On build 109 both version lists refreshed for real and 1.21.8 started, but vanilla 26.3 and Paper 26.3 could not start on the Java 21 image; the image now follows the game version, and in build 111 vanilla 26.3 and Paper 26.3 (Java 25), 1.21.8 (Java 21), 1.20.1 (Java 17) and 1.16.5 (Java 8) all started through the manager. Review findings fixed in the last batch (tests added): the SSH config file is never read, remote output is read in bounded chunks, containers and volumes are acted on only when they carry this manager's label, a changed host key type is reported as a changed key, and rename and delete are refused while a container exists. Not built: the other four targets, backups and the world generator. Batch 18 adds a server page with overview, logs, settings and removal tabs, and batch 19 stops the page piling up requests against an unreachable host (217 server tests pass; the manager has never been run against a real Docker host). The page's empty state, with no server, was seen in build 103 at 390 px wide; the server detail page with a real server has not been seen. |
| Local Ollama suite: third slice | Partly built | Servers, models, running models and model details for servers set up through the Ollama integration, pulling a model with progress and Cancel, deleting a model, and, new in batch 18, unloading a model, a model detail panel that names the assistants using the model, and a test chat that cannot control the home (`core/homeassistant/components/ollama_suite/`, `frontend/src/panels/config/ollama/`). Batch 19: the test chat refuses a model the server does not list. 88 server tests pass in a Linux container with fake streams; on 11 November 2026 build 106 was run against a real Ollama 0.40.16 server in a throwaway container: listing, details, pull with progress, cancel, delete, unload, the test chat and its refusals all worked, and the pages were seen at 390 and 1280 px wide. Table cells broke inside words there; fixed in batch 24, not seen. Not built: helpers. |
| Release notes page | Built, not yet seen in a running build | Lists the changelog by day with a Fixed and New filter and links to the page a note is about (`frontend/src/panels/config/release-notes/`). |
| File converter | Partly built | Tools, Convert: JSON, YAML, CSV, TSV and Markdown tables; PNG, JPEG and WebP images; text transforms such as Base64, hex, URL encoding and line endings. Batch 19 adds archives (ZIP, TAR, GZIP), text, Markdown and pictures to PDF, Word documents to and from text, audio to WAV, and a still picture from a video (unit tests). Not offered: reading PDFs, MP3 output and video-to-video conversion. Batch 21 hardened it against hostile files (a TAR header with a negative size no longer loops for ever, a photo's rotation is read only from its Exif block, pictures in a PDF stay compressed and capped, audio conversion has time limits and can be cancelled, long odd text no longer freezes the page, names with direction overrides are refused or cleaned; unit tests, including the reviewer's files). Seen in build 103 at 390 px wide: the categories show Ready and none shows "Unavailable". The new conversions have not been run in a browser (`frontend/src/panels/config/tools/converter/`, `frontend/src/common/converter/`). |
| Dashboard tools in the dashboard editor | Built, not yet seen in a running build | Edit mode has a Dashboard tools dialog: an outline of every view, section and card with a pattern-aware search and bulk duplicate, delete, move and copy as YAML; find and replace of an entity ID with a live count; a check for missing and unavailable entities, empty views and sections, duplicate view paths and cards without a type; card templates saved to the account; statistics and a phone, tablet or desktop preview width. Every change goes through the saved configuration, so undo and redo cover it. Unit tests of the editing functions only (`frontend/src/panels/lovelace/editor/dashboard-tools.ts`, `hui-dialog-dashboard-tools.ts`, `docs/features/dashboards/dashboard-tools.md`). |
| Media folder management and the Add media button | Built and seen in a running build, not on a phone | Folders can be created, renamed, moved and deleted in the Manage dialog; the server refuses names that leave the media folder and never follows a link out of it (141 server tests pass). Batch 20 fixed a defect found in review: a request naming "." as the folder resolved to the media directory itself, so a recursive delete could remove it; "." and the source root are now refused (the tests failed 19 times against the old code), the counts a person confirmed are enforced, upload and single-file delete no longer act outside the folder through a linked directory, and the Manage dialog is for administrators only. Media sources were seen in build 103. In build 106, with a headless browser at 390 px wide, pressing "Add media" opened a file chooser, an uploaded picture was listed and on disk, and a new folder was created; rename, move and delete were not driven there. The "Add media" button was reported broken on an iPhone because its file field sat outside the open dialog; it now lives inside the button, uploads to the image upload folder, and every media folder shows its filter field. Fixed in source only, not seen on a phone (`frontend/src/components/media-player/`, `core/homeassistant/components/media_source/local_source.py`, `docs/features/interface/media-folder-management.md`). |
| Update install progress and recovery card | Built, not yet seen in a running build | Update installs show real stages and a recovery card with actions; a slow restart is no longer reported as a failed update (`frontend/src/components/update-progress/`; unit tests of the stage logic and the entity state hub). Not built: the update dialog in the activity tray. |
| Support page and support bundle | Built, page seen in a running build | The page was seen in build 103 at 390 px wide; the bundle was not driven in a browser. A support page with a local bundle that is never sent anywhere; the bundle hides addresses in problem titles (`frontend/src/panels/config/support/`, `docs/features/help-and-privacy/support.md`; unit tests). |
| Editor save bar | Built, not yet seen in a running build | One save bar in every automation, script and scene editor mode; a read-only automation no longer shows an enabled Save (`frontend/src/components/editor/ha-editor-save-bar.ts`). Batch 21 makes the bottom navigation bar publish its visible height so the save bar no longer reserves room for it while it is hidden (the earlier blank strip; fixed in source, not seen). The save bar itself has not been seen in a browser. |
| Embedded page panel | Built, not yet seen in a running build | Reload, and a notice when a page refuses framing (`frontend/src/panels/iframe/`; address unit test). |
| Paid cloud service hidden in the interface | Built, seen in part in a running build | The cloud sign-in, its voice assistant steps and settings are removed from the interface; the server integration and anyone's configuration are unchanged, by the owner's instruction. Batch 20: a voice pipeline already set to a cloud engine keeps showing its engine, a configured cloud backup location is hidden, never offered for deletion and kept when settings are saved, and the network form no longer pre-fills or saves a cloud address as a custom external URL. Seen in build 103: the voice assistants page has no cloud promotion. Not seen: the pipeline, backup and network cases. Known limit: the service remains visible in a few places for someone who has it configured (an existing cloud-stored backup's location name, one entity filter). |
| History search and version picker | Built and seen in a running build | Dashboard history and automation history have a search field, and Compare uses a searchable version picker; the history and recorded problems pages say "Git remote" in full. The dashboard history overview with its search field and plural forms was seen in build 103 at 390 px wide (a tab's version count wrapped onto two lines there; fixed, not seen). Batch 21: Enter on the buttons inside the field no longer picks a version, the sheet does not raise the keyboard by itself on a touch screen and sits above it, "Show more" survives updates and a slow compare answer cannot replace a newer one (unit tests). The picker was seen in build 106 at 390 px wide: it opened, listed the versions, and choosing one produced a compare (`frontend/src/components/history/ha-version-picker.ts`, `frontend/test/panels/config/history-plurals.test.ts`). |
| Cantonese additions | Built, not yet seen in a running build | Eight more blocks, with a test that keeps them complete (`frontend/src/translations/yue-own.json`). |
| Drawing and annotation | Partly built | Tools, Drawing: pen, marker, lines, arrows, shapes, text, eraser, eyedropper, undo and redo, zoom, saving as an image or SVG (`frontend/src/panels/config/tools/drawing/`, `frontend/src/common/drawing/`). Not seen in a running build. |
| Everyday pages (canvas 01) | Partly built | Lights, Security, Climate, Map, Activity, History, To-do, Calendar, Energy and Home are started; not seen in a running build. Not started: the dashboard title row and the card picker. Left out because the instance does not report them: comparison with a usual day, the power lights draw, how many to-do items are done. |
| Tools pages (canvas 06) | Partly built | Storage, General, Labs, Restart, Events, Hardware, Network, States, Actions, Template, YAML, Statistics and Assist are written to their boards; not seen. Statistics has its sorting, grouping and address parameters back; sorting and grouping by area and the column settings are not restored. Not started: the AI and entity IDs page. The debug page is not drawn to its board. |
| Settings pages (canvases 03 to 05) | Partly built | Integrations, an integration's page, Add integration, Devices, one device, Entities, Areas, Labels, Scenes, the scene editor, Scripts, Zones, Blueprints, Dashboards, People, Users, Tags, Updates, Repairs and Logs are written to their boards; not seen except as listed above. A review found nine defects, all fixed in source. Collapsing a group is not restored on Scenes. |
| Shared list layout | Built, not yet seen in a running build | A button beside the title, filter chips on the search row, a line under the list and row checkboxes that always show, when a page asks; used by Devices, Entities, Labels and the list of automations (`frontend/src/layouts/hass-tabs-subpage-data-table.ts`). |
| Sign-in, first-run setup, About, Profile (canvas 02) and Zigbee, Z-Wave, Matter (canvas 07) | Partly built | Started on their boards; a review found four defects, all fixed in source. About was seen in a running build on 10 November (`docs/screenshots/about-page.png`); the rest was not. |
| Backups, voice assistants, cloud, energy setup, apps, automations and their history, MQTT, Thread, Bluetooth | Partly built | Started on their boards; not seen. A review found one fault that would have broken the Bluetooth page and thirteen defects, all fixed in source. The Analytics board is obsolete and will not be built. |
| Entity dialogs (canvas 08) and the dialog frame | Partly built | 35 of 36 entity dialogs are redrawn, each with a tab row and a tools block (lock, appearance, read aloud, export) and the state shown once (`frontend/src/dialogs/more-info/`). The row of tools in an entity dialog was seen in build 38; the redraws were not. Open review findings: water heater switch name, state shown by colour alone on humidifier, weather unit at 320 px, sensor attributes. A numeric sensor still shows two charts. |
| Shared state controls in entity dialogs | Built, not yet seen in a running build | Alarm, climate, lock, fan, vacuum and water heater follow the boards, behind an opt-in (`frontend/src/dialogs/more-info/components/more-info-control-style.ts`, `more-info-board-style.ts`). |
| Group dialogs and the image dialog | Built, not yet seen in a running build | Group dialogs ask before switching covers, locks or valves; the image dialog has no share button because the shared address carried an access code. |
| Date, time and calendar dialogs | Built, not yet seen in a running build | They follow the time zone chosen in the profile; the time dialog has spin controls and the date grid can be walked with the arrow keys. |
| Assist, shortcuts, release notes; credentials, discovery, infrared, serial, LoRaWAN | Partly built | Started; not seen. The Assist note says answers come from the house checks only the conversation engine. No Help page for shortcuts exists. Several boards need data the server does not supply: what uses a credential, which integration a discovery matches, learned infrared commands, reading a Modbus register. |
| Wording file celebration and sounds | Built, not yet seen in a running build | A short celebration over the whole window and a sound when a file loads, a different sound and message when refused (`frontend/src/components/wording/ha-wording-celebration.ts`). Unit tests with invented sample entries. |
| Support Tickets | Designed | Board `SupportTickets`; a support desk component exists (`frontend/src/components/support/`) and is not wired to a page. |
| Authenticator and QR pairing | Partly built | Authenticator: the app card on the profile page's Security tab (setup dialog, QR picture and key, a six-digit check, removal) is built on the server's existing one-time-code module; the profile security page with the card was seen in build 103 at 390 px wide, the setup dialog was not driven, and no real authenticator app has been used (`frontend/src/panels/profile/ha-authenticator-card.ts`, `dialog-ha-authenticator-setup.ts`). Not built: the board's code generator in Tools, because the browser has no credential vault to keep a secret in. QR pairing: the board is the lock wizard's QR step, which is already built and not seen (`docs/features/access/qr-pairing.md`). |
| Local version history | Partly built | Changes made in this browser to appearance, accessibility and open tabs, with undo (seen, `docs/screenshots/page-tools-history.png`). Tab order and pins were added since and are not seen. Nothing is kept on the server and dialogs have no history. |
| Export in every format | Partly built | CSV, JSON, Markdown, plain text and HTML, preview, download, copy and print (seen, `docs/screenshots/page-tools-export.png`). Since then not seen: a tab-separated format, selected rows only, formula cells made safe, duplicate column names kept apart, and a note when rows were cut. No spreadsheet or PDF files. |
| Selection bar and bulk actions | Built, not yet seen in a running build | A bar at the bottom that counts only the rows shown, says when ticked rows are hidden by a filter and previews a destructive change; used on Notifications, Labels, Automations and Scripts (`frontend/src/layouts/hass-tabs-subpage-data-table.ts`). A header checkbox review finding is open (see `HANDOFF.md`). Bulk actions on every table are not built. |
| Changelog viewer | Built and seen in a running build | Settings, About, What changed lists `CHANGELOG.md` by day with the commit that added each entry, a search with the pattern workbench, and export (`docs/screenshots/what-changed.png`); a test fails when the bundled list and `CHANGELOG.md` differ. |
| Rendered provider text | Designed | Board `ReleaseNotes`. |
| Notification centre and toasts | Partly built | The Notifications page was seen (`docs/screenshots/notifications-page.png`). Since then not seen: dismissed notifications kept for 30 days with Undo, no severity guessed from words, a failed dismissal reported, outside links showing their host (`frontend/src/panels/config/notifications/`). Not built: colours by severity, action buttons and stacked toasts. |
| Base64 toolkit | Built and seen in a running build | Encode, decode and data URLs for text and files with several alphabets (`docs/screenshots/base64-toolkit.png`). |
| External editor hand-off and publishing to a forge | Designed | Board `Handoff`. |
| Progress and recovery | Partly built | Built, not yet seen in a running build: an activity tray of running and finished work and a recovery card that offers to retry (`frontend/src/components/activity/`, `frontend/src/common/activity/`; unit tests; details are stripped of private values). Not built: the update dialog is not wired into the tray, and draft recovery for editors is design only (`docs/features/interface/draft-recovery.md`). Board `Progress`. |
| Fixes for defects seen in build 80 | Built, not yet seen in a running build | Language cards, plural forms, page titles, the converter's search label and the drawing board's height are fixed in source (`frontend/src/panels/config/personal/`, `frontend/src/panels/config/tools/`). Not looked at again in a browser. |
| Version and updated-at on the first screen | Built and seen in a running build | At the foot of the rail, from build-time constants; seen in the demo build. |
| Free, with nothing to buy | Built and seen in a running build | About shows this project's version and build time, where updates come from, that every feature is included and nothing is sold, and that the project is independent of the Open Home Foundation (`docs/screenshots/about-page.png`; seen again on 10 November 2026). The channel switch, automatic install switch and reachability check are not built. The launch screen no longer names the Open Home Foundation (not seen). |

## Not applicable to this product

| Feature | State | Where |
| --- | --- | --- |
| Windows virtual disk manager | Not applicable | A web application served from Linux has no Windows host to manage |
| Browser-extension download hand-off | Not applicable | No browser extension in this product |
| Job document wording | Not applicable | Applies to job-related products |
| Frameless desktop title bar | Not applicable | Runs in a browser or companion app |
