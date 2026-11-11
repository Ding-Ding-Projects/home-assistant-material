# Closeout prompt

A continuation note for whoever picks this project up next. It records state up to the commits
named below and claims nothing beyond them. The authoritative lists are `docs/feature-status.md`,
`ROADMAP.md` and `HANDOFF.md`.

## Project

home-assistant-material: a Material Design 3 build of Home Assistant (frontend in `frontend/`,
server integrations in `core/homeassistant/components/`, boards in `design/canvases/`, the Deploy
Assistant desktop app in `deploy-assistant/`). The goal is every board built and the running
product matching it.

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
  and covered by tests, and the fixes have NOT been seen in a browser.
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
  The defects found there were fixed afterwards and those fixes are NOT seen: seven messages that
  showed "Translation error" (a new test parses every string), info buttons named by an error
  string, notification checkboxes that did not select, the start cover of a lock missing on some
  loads, the YAML tools title cut short, a plural, touch targets under 44 px in the pattern
  workbench and the appearance editor.
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
- Frontend suite: 5,845 pass and 3 fail (`build-management.test.js`, as before). Test files that
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
