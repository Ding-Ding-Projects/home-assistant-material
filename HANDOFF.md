# Handoff

Written 9 November 2026 and brought up to date on 10 November 2026 for whoever picks this up next.

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

## What is known to be unfinished or untrue yet

State these plainly to anyone who asks:

- The test address through the tunnel still answers 502 until one proxy entry is added on the
  tunnel host. Nothing in this repository can fix that.
- No operating system image has been booted with an over-the-air update. The signing secrets
  exist since 10 November 2026, but no build has finished its operating system images since
  and no update between two such builds has been watched. Only the VMware image was started.
- The companion phone app connected after a proxy fault was fixed. Some setup problems the owner
  reported with it are not yet described here and not yet fixed.
- The Welcome screen of first-run setup was seen still showing upstream items (a cloud restore
  and outside links). The fix is in source and has not been seen.
- Opening an editable copy of Overview straight in edit mode was broken and is fixed in source,
  and so is the welcome banner covering the Overview header at phone width; neither fix is seen
  in a running build (the banner fix was confirmed only by applying its rule in the open page).
- The passkey sign-in page and card, the Google setup page, the dashboard history page, the
  Minecraft and Ollama pages, the problem log page, the offline help reader, and every page
  listed as "not yet seen" in `docs/feature-status.md` have never been opened.
- Of the Python tests of the new integrations (`core/tests/components/`), only the passkey tests
  are known to have been run, in a running copy (143 passing). No result is recorded for the others.

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
- Minecraft server manager: version lookup, start, stop, logs, backups and the world generator.
  How a containerised install hosts another container: SSH to a Docker host (default), opt-in
  Docker socket mount, or an app on operating system installs; a process inside the container
  is the weakest. The reviewers' findings that port conflicts were keyed by target type
  rather than host, that nothing checked the ports this instance uses (8123), and that a corrupt
  stored item raised at list time are not confirmed fixed.
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
4. Work down the queue above and `ROADMAP.md`.
