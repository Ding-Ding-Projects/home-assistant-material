# Closeout prompt

A continuation note for whoever picks this project up next. It records state up to the commits
named below and claims nothing beyond them. The authoritative lists are `docs/feature-status.md`,
`ROADMAP.md` and `HANDOFF.md`.

## Project

home-assistant-material: a Material Design 3 build of Home Assistant (frontend in `frontend/`,
server integrations in `core/homeassistant/components/`, boards in `design/canvases/`, the Deploy
Assistant desktop app in `deploy-assistant/`). The goal is every board built and the running
product matching it.

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

## Batch 27 state, 11 November 2026 (evening): read this first

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

## Current state

- `main` holds the work up to commit `5fbf6d91b`. The batches since the last note are batch 20
  `d68fda3b1`, batch 21 `88b36b5d8`, batch 22 `ba7a6a431` and batch 23 `e0f2d7235`; earlier ones
  are batch 18 `8fa63f05d`, batch 19 `0d056629e`, the pinned group header fix `f86ff751a`, the
  dashboard tools dialog `cbefeaf48` and the release workflow commits `5b2c6af85`, `b64779d75` and
  `3ce9e087a`. Other lanes may have uncommitted changes in the working copy; stage files by
  explicit path.
- Commit `b64779d75` carries a message that belongs to another project. It copies the Deploy
  Assistant installers onto a release straight after the release is created and withdraws a
  release when no build job of its own attached a file. `3ce9e087a` records this; history is not
  rewritten.
- The hosted instance on the owner's network runs build 2026.11.1.106. Builds 88 and 91 were
  skipped on purpose (settings saved on the instance could cross between two accounts on one
  browser; batch 18 fixed it). Builds 102 and 105 were skipped on purpose: 102 lacked the media
  folder safety fix and 105 had the first version of the activity record.
- Landed since the last note: a media folder safety fix (a folder named "." could make a recursive
  delete remove the whole media directory), the paid cloud service hidden in the interface without
  changing anyone's configuration, file converter hardening against hostile files, version picker
  and phone layout fixes, a permanent record of the Activity page kept in a Git repository (batch 22,
  made loss-resistant and cheap enough for a Raspberry Pi in batch 23), and smaller menu rows.
- Closed by the owner's decision: the phone app's earlier setup problems (nothing left to fix).

## Verified, and how

- Verified by running: frontend type check clean; 5,401 frontend tests pass with the unchanged
  baseline of 3 failures and 46 files that do not load; server tests in a Linux container: activity
  record 124 passed, automation and dashboard history 157 passed, media source 141 passed, Ollama 88
  passed.
- Run for real: the activity record on a throwaway copy across two restarts (it kept its
  first-version day file, wrote the new chunk and committed at shutdown), and on the hosted
  instance at build 106, where it created its repository and first day file.
- Seen in a running build (build 103, headless browser at 390 px wide, signed in with a generated
  test account on a throwaway copy): the file converter (categories show Ready, no "Unavailable"),
  the support page, the Minecraft servers empty state, the profile security page with the
  authenticator card, the Ollama empty state, the updates page, media sources, the dashboard
  history overview with its search field and correct plural forms (one defect seen and fixed
  after: a tab's version count wrapped onto two lines), and the voice assistants page with no cloud
  promotion. In build 106 the same way: the Permanent record page (status Recording, counts, one
  day listed).
- Earlier, seen in build 96 at 390 px: the Marketplace list scrolls with its group header pinned,
  the Personal settings preview scrolls away, the accessibility panel's rows no longer overlap.
- Release pipeline, observed: every release carries the Deploy Assistant installers (v2026.11.1.88,
  .91, .93); runs replaced by a newer push are cancelled and leave no release; 37 empty releases
  were removed by hand.

## Not verified

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
- Not seen in any browser: the update install progress and recovery card during a real install.
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
  Reload cleared it, and the toolbar fitted at 390 px wide. Also
  unseen: the activity record's search and a push to a real Git remote, and everything from the
  earlier batches that `docs/feature-status.md` still marks "not yet seen".
- Observed: a documentation-only push (run 112, 11 November 2026) finished without publishing a release, as intended.
- Passkeys were run with a browser virtual authenticator, never with a hardware key or a phone.
  Minecraft 26.3 failed on the Java 21 image in build 109 and starts on the per-version image in
  build 111.
- The operating system image was built in build 109 after the two unit files were renamed (the generic virtual machine image and the Raspberry Pi 3 image; the Raspberry Pi 4 and 5 jobs of that build were cancelled by a newer push), and the build log shows both mount units enabled under their real names; that image was booted in a virtual machine on 11 November 2026 (first start finished, the supervisor reported healthy, and the journal shows both mounts made).
- `deploy-assistant\build.bat` (another lane's) has not been run by this work.

## Known limits

- The activity record can still lose entries in the ways its documentation lists (a power cut in
  the seconds before a flush, a real queue overflow, shutdown while the disk is failing), and it
  does not import entries from before it started.
- Reading PDFs, MP3 output and video-to-video conversion are not offered.
- The paid cloud service is hidden in the interface only; it remains visible in a few places for
  someone who has it configured (an existing cloud-stored backup's location name, one entity
  filter).

## Next steps

1. Open each page listed under "Not verified" in the hosted build or a throwaway copy, starting
   with "Add media" and the media Manage dialog on a phone; record what is seen in
   `docs/feature-status.md` and tick `ROADMAP.md` only then.
2. Try the activity record's search on a longer history and a push to a real Git remote.
3. Watch the next documentation-only push for the absence of a release; build an operating system
   image and confirm the two renamed mount units are back under their real names.
4. Prove backups carry `automation_repos/` and `dashboard_repos/` (see `HANDOFF.md`).
5. Remaining board work: the Tools code generator (needs a credential vault), schedule triggers
   from entities and web services, the guided form worked example and practise control, the update
   dialog in the activity tray, draft recovery for editors, collapsible statistics.
