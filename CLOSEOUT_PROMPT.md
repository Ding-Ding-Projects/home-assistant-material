# Continuation handoff

Updated 22 November 2026. Start with the [current checklist](ROADMAP.md#current-checklist-22-november-2026) and the [build 548 verification handoff](HANDOFF.md#build-548-verification-22-november-2026). Work through the checklist in order and record the observed result before each item is marked complete.

Of the 261 originally unchecked or partial rows, 19 have new evidence and are now checked. The
original list has 114 checked rows and 242 still open. Keep the source publication, successful
normal release, isolated package verification and backed-up owner rollout as distinct steps.
The stable feed and the published 548 tag predate these local source changes.

## Objective

Home Assistant Material: keep today's look with a modern polish, repair scrolling and cut-off text, add controls in place, a run-once quick action and "show more details", and keep the public site current. Nothing is removed. Dramatic motion is for actions only. Dashboard cards stay as they are.

## Where the source is

The published `main` baseline for this pass is `e86e70e1cf8628f11d43c173d60f0f6084c2eb7e`. The update feed lives on the separate `channel` branch. The primary working copy contains the Thread repair, all four interface changes, AC Defender weather handling, the release audit and build and publishing changes. The original History change also remains on its own local working tree. The complete 48-file delivery draft and published main produced the same 8,796 publication findings by file and category, with zero new occurrences on added lines. Main source publication remains pending.

## What is running where

- The owner's instance runs build 2026.11.2.547 (Core) and 2026.11.0.547 (Supervisor), moved there on 21 November 2026 at 09:50 Toronto time after build 547 passed a browser check on a test copy. Supervisor self-update is off.
- Build 548 (source `7650c522a`) is published with 29 attachments. On 22 November the isolated update, watcher, one-step recovery and narrow rows passed. Each stock build reached 80 distinct screens. Thread produced two uncaught responses on both builds. The repaired local wheel passed all 82 navigations with zero exceptions. Publication and verification of a new normal release are still required before updating the existing installation.
- The earlier full test copy `ham-full-queue` was kept stopped. This pass used a separate
  synthetic Core 548 installation. It contains generated test readings and camera colour bars.
  Its browser results and the owner's installation have separate version and health records.

## How a build reaches the owner's instance

1. Commit with `[skip ci]`, push, then start one build: `gh workflow run release.yml --ref main`. A new run cancels a waiting one, so start it once.
2. Wait for the image, then check that exact build in a browser on throwaway copies: the 80-page pass, the items the build claims to repair, and a comparison with the build that is live.
3. Only on a pass, update the owner's instance, Supervisor first, with a backup, and read back the versions and that self-update is off.
4. Write the build's notes in the updates log repository, and check each demo really runs.

## History of the last builds

536 passed. 542 and 543 were refused (names squeezed on a phone in the Entities list; the search drop-down emptying). 544 passed. 545 and 546 were refused for Updates page faults. 547 passed.

## Repairs verified in the build 548 browser check

- After an update that includes Core, the summary's "whole run took" time read too short in the browser that ran it.
- A stranded run with one step left offered only "Clear this run".
- On some phone rows a wrapped button sat at the left while the others sat at the right.

## Not verified, said plainly

- The operating system update step cannot be exercised in a container copy.
- "Still installing, finishes by itself" on a stranded run was never seen, because the test installs finish in seconds.
- On 22 November the public home page, its seven linked scripts and styles, and the existing `img/home.webp` returned HTTP 200. The intended `img/hero-light.webp` and `img/hero-dark.webp` returned 404. Capture both themes from the accepted build and verify the published result.

## Checks at this commit

- On 22 November, five focused frontend suites passed all 53 tests for release notes, shared update state, timing and narrow row controls. The historical full-suite results below were recorded separately.
- The Thread lifecycle test failed on the original panel and passed on the repair. On Windows the two gallery diagnostics were traced to its missing generated index. After repairing page discovery and adding generation to `pnpm run lint:types`, both TypeScript projects passed.
- The build-management and process suites now pass all eleven tests on Windows, including blocking type checks while a gallery build owns its files. A real compiler retained ownership after the controlling process alone was terminated. Checks also covered graceful exit, forced-exit recovery and older records without comparable clocks. A separate Linux check passed. The historical full-suite result below predates these changes.
- Frontend: 9970 tests pass, with the 3 long-standing failures in `test/build-scripts/build-management.test.js`. Type check at its 2 long-standing gallery errors.
- Python, run in a throwaway container with the recipe at the top of `HANDOFF.md`: `auto_update` 162 passed, `quick_action` 12 passed (at commit c2e5b0256; no Python changed since).
- Wording scan of every added line: clean.

## Open items

- The revised local frontend tree `480c0f7a27e2aeaeb2eeffd5532d79d2800f0c9c` produced wheel SHA-256 `71391348aae7a5b852b16b1ed1f26eb998518b00ad7240ad7adaa1190689175b`. The normal product routes for History, States, Tags and Areas passed 24 functional cases. All six States geometry checks and all six cross-floor drag checks passed. The earlier 360 px overlap is resolved in these bytes. The source and release still need publication before a production update.
- The light and dark lead images from accepted build 547 and their source records are ready in the isolated website preview. On both 360 and 1440 px, switching the theme by keyboard loaded the correct image and the choice persisted after reload. The published 547 English and Cantonese notes and its interactive watcher demo were exercised. Verify the updated lead images on the public address after the source publication check clears.
- The preview contains 162 guides. The complete source wiki was checked against its index and two editor articles. The 11 internal wiki links worked at both widths. The public home, demo and both existing editor articles returned HTTP 200. The two new public lead-image URLs returned 404.
- The light-theme row on the original roadmap is now checked. The seven wide screens, light detail sheet and Personal settings search all passed. At 360 px, the input retained a 94 px editable area and returned the same five matches as the wide view.
- The recording button saved a 10-second synthetic H.264 video. Disabling and restoring the recording service verified its unavailable and ready states. The test browser retrieved the file, and an independent decoder verified the frames.
- The published x86-64 Core package contained all 63,984 expected English strings for 1,161 integrations. The historical build 524 release readback is complete. Individual release and rollout evidence for 525 and 526 remains partial.
- Wheel `49ed6a6b87298fc9a78ca4e2db750e65491d99de770dac15bc5c2ecfc81234d3` fixes the Cantonese Dashboards subtab heading. All 33 page and tile labels passed on the isolated installation. The full 82-route pass succeeded in all three languages, 246 navigations with zero uncaught exceptions. All four web manifest shortcuts reached their intended screens in a 360 px browser.
- The hosted site serves 161 guides. Its 813 internal article links resolve. The newer Quick actions guide and the two replacement lead pictures return 404. The latest release-tag site deployment was rejected before its first step by the main-only environment. The local fix requests a run on main. Publication and hosted verification are still required.
- The public wiki home was updated separately and read back at `52672e6b7f40c0a929cae88e671b0347be6a06c9`. All three wiki files passed both the staged and outgoing publication checks. Its complete local site mirror now passes 13 internal wiki links at each width and all 824 internal article links and anchors.
- A real populated History comparison passed for two consecutive nine-second windows on the synthetic installation. Day and week lookbacks showed the correct empty states. A native reader still needs to review the settings text in context. The original settings change covered 58 source files and includes dynamic wording and nested dialogs.
- Both defenders passed six setup and settings forms, default sensor state and missing-entity repair checks. The local AC fix connects real hourly weather to its decision and cancels a pending unsent off action if eligibility changes. The English validation messages in the non-English locale and physical-device proof remain open.
- The packaged candidate was built from `61b7b783a0bb0f2f0cf79594c78cd75dc1fbf7ec`. Its local Core image is `sha256:cfadf6d312531335df04cc8c0ff966219b427c7e5d096302027a1682c1c47652` and contains the same `49ed6a6b8729` frontend wheel. All 83 focused checks passed inside this image without mounting replacement application code. The owner's Core and Supervisor were read back at 547, healthy Supervisor, automatic Supervisor updates off.
- AC Defender's nested reason and two-hour pause were displayed in all three language modes.
  The owner pause reason and exact deadline survived the isolated Core restart. The task
  removed its synthetic entry and restored the original settings after verification.
- The final standalone Core package served its home, manifest and first-run endpoints on
  port 8123. The three verification fixtures were stopped with their data retained. The
  owner installation stayed healthy on build 547.
- The separate public screenshot gallery published its first four new dashboard pictures
  at `20d887625db72a51c8db5358e52238dac7534b76`. All four downloads and the gallery manifest
  matched their published bytes. The existing source README links to the working gallery.
- Quick buttons are not in entity pickers or dashboard cards, on purpose.
- Design canvas 42 records the owner's decisions: `design/canvases/42-modern-polish-2`.

## Rules that must hold

No confirmation is weakened: the two keys and the slider stay. Nothing installs by itself, and a browser that only watches an update never starts one. Going back to an older build makes a backup first. The update run record is display only. No data leaves the home except what the owner turned on. No private wording, machine path or address in any file here.
