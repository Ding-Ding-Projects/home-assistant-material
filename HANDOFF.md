# Handoff

## Issue and handoff sweep, 27 November 2026

The sweep began on `main` at `ddc8aea3f78d5658563509616bdf5535155e5759`. The locally edited candidate still needs integrated verification and publication. All 12 issues were open at the start. Continue on `main` and record closures only after the corresponding published checks succeed.

| Item | Evidence and next check |
| --- | --- |
| #1 appliance boot | Four build 572 manifests and their 12 listed release digests matched. The downloaded VirtualBox archive independently matched its checksum. EFI raised a general-protection exception before the kernel, so retry the isolated guest with one virtual CPU and VMSVGA. Pi emulation remains pending. |
| #2 signed update | Verified build 569 source image and the build 572 signed update offer. Boot reached first-start services in the isolated guest. The update and post-reboot readback remain pending. |
| #3 build entrypoints | Verified an actual nonzero build phase, installed dependency detection and invalid-board rejection on Windows. The portable build application and release attachment wiring are local. Verify the package built from the final source revision and run both supported build entrypoints against isolated targets. |
| #4 shell | 163 focused tests passed. The published demo showed default tabs, mobile navigation, accessibility tools, Settings and Energy. First-run, dark appearance and complete design parity remain open. |
| #5 language and personalization | 117 focused candidate tests passed for browser-local wording. The published demo exercised language, narration, focus, schedules, identity and wording persistence. Rebuild and verify local-only storage and clearing, and diagnose the Dim Sum toggle that returned to enabled. |
| #6 appearance | 67 focused tests passed. The published demo verified keyboard typography and colour controls. Rebuild and verify the new underline, strikethrough and small-capital controls and the remaining appearance boards. |
| #7 navigation | Existing checks passed 569 tests. The demo shortcut preference and dashboard starting points changed locally. Verify the updated shortcut and editor flows in the built candidate and complete the extension and pattern-workbench checklist. |
| #8 safety and sign-in | The published demo reproduced immediate support-ticket deletion. The local repair uses the existing two-key confirmation. Authenticator enrollment cancellation and retry also changed. Verify the updated flows on a built instance with a synthetic enrollment module. |
| #9 records | 179 focused checks passed, including confirmation and selection stability for notification dismissal. The published Changelog route showed release entries. Verify the rebuilt notifications workflow and finish the History, Export, Bulk, Docs and About checks. |
| #10 tools | 269 existing focused checks and three editor-handoff checks passed. The candidate opens an available configuration editor or edits a selected local text copy. Built acceptance, forge handoff and world generation remain open. |
| #11 appliance and add-on | The synthetic appliance runner passed startup, update, unhealthy-update recovery and rollback. Supervisor Store discovery after the fixture renames, add-on ingress and actual board boot remain pending. The ingress panel currently covers account setup, sign-in and entity viewing. |
| #12 editors | The published demo reproduced loss of the Audio format selector at 390 px. The candidate restores the existing rich field route for speech options. Rebuild and replay the speech, named to-do and dashboard save/reload cases. |

Published synthetic checks passed for camera row filtering and full-day timeline dragging, the printer dashboard cards and Stop confirmation, and the phone card editor across 20 card and viewport combinations. The camera recording repair passed 45 Core tests and a real FFmpeg fixture. The SSH repair passed a real isolated key, bind and revocation check and a loopback connection through the selected port. Playback and hardware proof, the installed SSH Settings flow and full startup restore remain open. Rebuild the integrated candidate once all edits are settled and run the publication scan before transmission.

## Phone card editor check, 27 November 2026

At 390 × 844 CSS pixels in Chromium, the Floor lamp tile opened with its Config form visible in the published demo. The local demo built from `a5f04a15d` also opened the editor. On both builds, switching to Visibility, returning to Config and expanding Content exposed the name, icon, color and layout controls. On the local build the expanded form began at (12, 241) and measured 362 × 934 CSS pixels.

The empty Config tab reported below did not reproduce for this card and viewport. Neither candidate was merged. The first changes preview placement and scrolling. The follow-up changes shared dialog styling at heights of 520 pixels and below. Other cards and viewport sizes were outside this check.

## Emergency pause, 25 November 2026 (evening)

Five pieces of work are drawn (canvases 48 to 51) and built on branches, none on `main` and none built or seen in a
browser. See [CLOSEOUT_PROMPT.md](CLOSEOUT_PROMPT.md) for branches, test results and next steps. Findings worth keeping:

- The instance on the development computer is a nearly empty test instance; the owner's day-to-day instance with the
  cameras runs elsewhere, so its logs could not be read. The SSH page exists so that can change.
- Before this work, camera recording logged nothing when a camera failed to record, and showed a camera as recording
  as soon as ffmpeg started, even when no file was ever written. Both are fixed on the integration branch.
- The timeline playhead could not be dragged: only press and release were handled, and the window re-centred after
  each release. Fixed on the integration branch.


## Closeout, 25 November 2026

Work paused here. What the remote holds:

- `main` is at `50b086e5c`. It contains the scroll and polish fixes from design canvases 46 and
  47, the fixes from the build 564 check (`e28dd990e`), the shared filter chip menu, and the
  marketplace rename (`f42a95165`). Every row in the roadmap section for canvases 46 and 47 is
  still unticked, because none of it has been checked in a browser on a published build.
- Release run 45675736303 (a manual build of `50b086e5c`) was still running when work paused.
  It has not been checked. The owner's instance was not changed during this closeout; read its
  versions before the next move.
- The card editor's empty Config tab is not fixed on `main`. Branch `worktree-wf_d6ee1ac0-504-1`
  holds two commits:
  - `8efac94bd` is a complete first attempt. The dialog becomes a flex column, the tabs stay in
    view, and only the form scrolls below a compact preview.
  - `3eafb6dcd` is a review follow-up that was stopped partway. It undoes part of the first
    attempt and adds unreviewed short-screen rules to the shared dialog, dialog header and dialog
    tools.

  Neither commit has been reproduced or verified in a browser. Two investigation probes under
  `frontend/test/panels/lovelace/editor/scratch/` exist on that branch only; remove them before
  merging.
- The full `tests/components/marketplace` suite passed in WSL on the core tree of `f42a95165`
  (core is unchanged on `main` since): 1283 passed, 55 snapshots passed, 4 warnings, in 1 h 20 min
  51 s.
- Two design items are partly done:
  - the docked media player bar look (canvas 46);
  - the badge and card edit-mode menu buttons (canvas 47), which have a 40 px hit area and no
    wider gaps.

Next, in order:

1. Card editor. On a throwaway copy at 390 × 844, reproduce the empty Config tab and record what
   the page actually renders. Then choose between the two approaches on the branch, verify the
   fix in a browser, and merge. Push with `[skip ci]` and start one build.
2. When a build of `50b086e5c` or later is published, check it on a throwaway copy:
   - the canvas 46 and 47 items;
   - filter menus not jumping while you type;
   - the pattern workbench footer;
   - the add-integration list and its fallback brand icon;
   - dropping a `.hapkg` file;
   - the printer discovery strings.

   Only on a pass, update the owner's instance, Supervisor first and with a backup.
3. Tick roadmap rows only with that evidence.

## Build 548 verification, 22 November 2026

The public tag `v2026.11.2.548` points to `7650c522a5e2bae90ac9f817e7853360cd78b2dd`. The
normal release lists 29 attachments. The stable feed offers Core `2026.11.2.548` and Supervisor
`2026.11.0.548`. On 22 November the installed Core and Supervisor both reported build 547,
the Supervisor reported healthy, and its self-update setting was off.

Two release-note suites passed 13 tests. Three suites covering elapsed time, shared update state
and narrow row ordering passed 40 tests. Use the [current checklist](ROADMAP.md#current-checklist-22-november-2026)
to record the evidence for each row. The [release](https://github.com/Ding-Ding-Projects/home-assistant-material/releases/tag/v2026.11.2.548)
and [build notes](https://ding-ding-projects.github.io/home-assistant-material-updates/releases/548/) are public.

Two isolated stock installations served 82 navigations each, covering 80 distinct destinations on
both builds. The only page with uncaught JavaScript responses was Thread. Both 547 and 548 emitted
two `unknown_command` responses with the integration absent. The new focused test failed on the
original panel and passed when the panel waited for Core to register Thread.

The local production wheel built from tree `4f088f3cec3573fa68e2021efafe0516760cf4cd`
has SHA-256 `9bdfee2d19e7443f5ae2a7daeb9b01b6106533bd6e540416cc3d74229c4aaa3f`. On the same
isolated 548 backend, the browser verified the entrypoint and three Thread chunks against the
wheel. Thread rendered the three expected empty-network headings, sent zero Thread commands in
49 outgoing WebSocket messages and raised zero exceptions. The candidate then served all 82
navigations, reached the same 80 destinations with the same page titles and raised zero exceptions.
The comparison receipt has SHA-256 `ed10f2ce3cf0486928263a17de936903925579f7e99550e4d773eeaf3a891576`.
The repaired source has not been published. The existing installation remains on build 547.

The complete local Core image `sha256:4a8f0e5978b1456dcce16b2614cdd98090e75c12e4e5fbd398fe93d7d1852a01`
also passed an independent packaging check. Its own frontend and backend opened Thread settings
after normal registration on a fresh configuration. The backend identified itself as local
`2026.11.2`. Of 52 outgoing WebSocket messages, none requested the absent Thread service and
the page raised zero exceptions. The package receipt has SHA-256
`ebfed9bfe31c2b9bf57b5ef0b69fb4a3b606d39d84485c96eb8c9197f9927133`.

In the backed-up update test, the two browsers served the published 548 frontend while the
comparison backend upgraded from 547 to 548. The total was 144.759 seconds, including 132.743
seconds for Core. Both browsers displayed three finished steps. The driver sent three install
calls and the watcher sent zero. On a separate 548 fixture, closing the driver left one update
waiting. At 322.99 seconds the observer offered it by name and completed it through its normal
action. The 360 px checks passed on 13 entity rows and three Blueprint rows. The stock-build
verification receipt has SHA-256 `66004a4272b421752afe732134117d68f0e46c4f346afa9120ff6e9fca93f719`.

The frontend type-check command now generates its gallery index before checking both projects.
The Windows generator uses portable page IDs and a file URL for its sidebar module. Both type
checks passed and two consecutive generations covered the same 114 pages with identical output.
The build-management and process suites passed all eleven tests after fixing Windows start-time
identification. A legacy record whose live owner cannot be verified is retained. The graceful-exit
and forced-exit cases were exercised separately. An independent Linux check covered live ownership,
legacy retention, a changed start time and releasing the correct record.
The type-check command also starts the native compiler directly. On Windows the recorded PID
was matched to the installed `tsc.exe`. Stopping its coordinator left the live compiler holding
the output lock. A competing invocation was rejected. The next invocation completed both
TypeScript projects and removed its lock after the compiler exited.

The combined local test tree `c271bec6dcd29fd95d0db5a1998a4547806c2c3f` produced frontend wheel
SHA-256 `292158e19323c23ecc755305dc637d97fb403e32f86c557479e0392a01fa983c`. The browser used
the normal History, States, Tags and Areas routes on a synthetic installation. Tests exercised
360 and 1440 px in English, Cantonese and bilingual mode. History actions changed the live
entity while preserving the same three recorded samples. Tag disclosures remained independent
when filtered. Area disclosures opened without navigation, and edits and drag handles remained
separate. Within-floor and cross-floor changes persisted after reload. States actions also
worked in every case, but switch and identifier text overlapped at 360 px. Its source correction
stacks those items. On the revised wheel, every text-line rectangle cleared the switch in all
six combinations. All four normal workflows passed again, for 24 browser cases. Six cross-floor
transfers persisted after reload; one initial narrow-screen attempt required a repeat. The
browser verified 161 response hashes. The final wheel has SHA-256
`71391348aae7a5b852b16b1ed1f26eb998518b00ad7240ad7adaa1190689175b`, built from local tree
`480c0f7a27e2aeaeb2eeffd5532d79d2800f0c9c`. The final browser receipt has SHA-256
`5e34b0235a212bcbf6fb0a4a8cd8ffa69c03f34d5ff7571c83516625c008ee2a`.

The same wheel passed the 1440 px light-theme review on Dashboard, Entities, Settings home,
Updates, Backups, Personal settings and AC Defender Now. The synthetic light's detail sheet
fit at 580 × 615 px. Opening Personal search with the keyboard found five matches for
`sound` at 1440 and 360 px. Its editable area measured 218 and 94 px respectively. The browser
matched 166 frontend responses. The light-theme receipt has SHA-256
`e14b8f6cf1a03d212ffc2254ff43422a2a0cc1f8fbcc6f7dd2f1d7bc6f24b6ba`.

The local website preview served 162 guides. Its wiki index covers all three source pages at
wiki revision `48c60874de30dc18fb22d61f4521e222baa465cb`. Both editor articles preserve all
source paragraphs. The 11 internal links, including the two new workflow sections, worked at
360 and 1440 px. The website regression checks passed at both widths. The public home page,
demo and both editor guides returned HTTP 200. Both new lead-image URLs still returned 404.
The live demo at `/home-assistant-material/demo/` identified its published source as
`fc5d13aaead59052bae3cce0a00c26cf97e0c4c0`. Keyboard interaction at 360 and 1440 px
toggled the sample floor lamp off and back to 70% and opened and closed the dashboard menu.
At each width all 90 project scripts returned HTTP 200 and no page exception was observed.

The full publication check compared the assembled 37-file draft, tree
`944df3e879e1d48fdddbf8b588bd8f48798853f2`, with the published source `e86e70e1`.
Both produced 8,796 findings with the same locations and categories. There were zero new
occurrences on added lines. The full check still exits 1. Source publication, deployment
and the owner update remain pending.

The camera recording button saved a 10-second H.264 clip of generated colour bars. Its normal
download returned 26,062 bytes and an independent decoder read all seven bands. Disabling the
isolated recording service disabled the button. Re-enabling restored it. The headless browser
fetched the segment but lacked an H.264 decoder. Physical camera compatibility remains open.

The 548 release workflow succeeded on both translation build jobs. Reading the published
x86-64 Core package found all 63,984 source-defined English strings across 1,161 integrations.
The comparison used release source `7650c522a` and image
`sha256:aecd6afdc54a53ad99a3cfbd8fcb6adf458140778a7004e45a3486e2e822ebd1`.

Six real setup, reconfiguration and options dialogs across AC and Heat Defender displayed
validation and accepted corrected values. The optional sensors were disabled by default,
and four missing-entity Repairs entries cleared after restoration. The stock Core did not
provide a forecast to the cool-outdoor guard. Its two validation alerts also remained English
when queried for `zh-Hant`. The local coordinator now requests genuine hourly weather in the
background and requires every configured hour. The isolated service registry confirmed that a
previously unsent off action is retried while eligible and dropped if the forecast warms before
the send. No physical unit was exercised.
The unmodified Core package timed out waiting for the weather call under the new integration
regression. With the repaired source mounted read-only, all 83 focused weather, control,
cool-outdoor and reference-number checks passed on that same Core runtime.
The normal `build.bat /s` entrypoint then produced Core image
`sha256:cfadf6d312531335df04cc8c0ff966219b427c7e5d096302027a1682c1c47652`
from source tree `61b7b783a0bb0f2f0cf79594c78cd75dc1fbf7ec`. All 83 checks passed again
inside the new package using its own shipped modules. One existing HTTP server deprecation
warning was reported. Its frontend wheel is byte-identical to the three-language browser
candidate. The complete package is local and has no new public release.
On the isolated running Defender page, a nested reason explained the 23.0 °C target and
1.0 °C wall adjustment in each language mode. An owner pause, including its exact deadline,
survived a supported restart of that test Core. The original fixture was restored. The
reason-and-pause receipt has SHA-256
`ae514f263c77f2ec0eed5eb4f28ee3e9d2b28361db7de1675afd03c9738b03fe`.

The latest local frontend wheel is
`49ed6a6b87298fc9a78ca4e2db750e65491d99de770dac15bc5c2ecfc81234d3`, built through
`build.bat /s` from tree `e9b6b0b66e35b90938392124e0d9783f1dbc7445`. The Dashboard heading
previously stayed English in both non-English modes despite the translated breadcrumb. The
actual subtab key now supplies its Cantonese caption. The browser confirmed all 33 page and
tile labels across three modes and matched 168 served scripts to the wheel. The caption
receipt has SHA-256 `1bb464bff2bc560895a97e971c873a463f40963b8ce74d89d36e9d8cb5a804c1`.
On that same wheel, all 82 standard navigations passed in each language mode. The three passes
each reached 80 distinct destinations. All 246 were HTTP 200, all 306 observed script
responses matched the wheel, and there were zero uncaught page exceptions. The route receipt
has SHA-256 `47192b48ae6fb7f2c92950fd1634f9a3a538fee07064a5cea19dbebee97e44a5`.
The four shortcuts in the installed web manifest also opened their intended destinations at
360 px, including the initial Energy setup screen. Native phone launcher behavior is unverified.
The History page compared real readings from an isolated numeric helper in two consecutive
nine-second windows. The current readings and their timestamps remained unchanged in Off,
Previous, Day and Week. The earlier series aligned by 9,000 ms. The day and week lookbacks
showed their genuine empty state. The receipt has SHA-256
`d1193eb2ca9574638093a6c60f05449a0c21d2a6b35ebc3f2bc7947854e85c88`.

The public documentation serves 161 of the 162 guides now present on main. Each of the 813
internal article links and all three article images resolved. The Quick actions guide is newer
than the deployment and returns HTTP 404. The About URL points to the correct public home.
The [548 documentation deployment](https://github.com/Ding-Ding-Projects/home-assistant-material/actions/runs/44927006063/job/136915185991)
was rejected before any build step because only main can deploy to its environment. The local
workflow requests a new run on main when a release is published. Only that branch can enter
the deployment job. Five local event cases, the exact dispatch arguments and `actionlint`
passed. The workflow repair and new pictures still require publication and live verification.
When the product publishes with its built-in workflow token, the release event is suppressed.
A separate job requests the same main-branch run in that case. The two other publisher choices
use the normal release event. Four local credential-selection cases exercised one route per
release. The authoritative release readback is reused after the feed advances.

The [public wiki home](https://github.com/Ding-Ding-Projects/home-assistant-material/wiki)
was updated independently with the interactive sample and direct links to both published editor
articles. Its default branch and home file were read back at
`52672e6b7f40c0a929cae88e671b0347be6a06c9`. The complete staged and outgoing wiki scans
both passed with zero findings across all three files. The local site mirrors the ten home
text blocks and both complete articles. Its 13 internal wiki links worked at both widths.
All 824 internal article links and anchors and the three article images resolved locally.
The separate public gallery published its four new dashboard pictures at
`20d887625db72a51c8db5358e52238dac7534b76`. The gallery manifest and all four PNGs returned
HTTP 200 and matched the published bytes. The source README's direct gallery link was verified.
The final standalone Core package also served its home, manifest and first-run routes on port
8123 in a fresh isolated instance. The test fixtures were then stopped with their data retained.
The owner's instance kept running and remained healthy.

## State on 21 November 2026

Written at 11:20 Toronto time. All work is on `main`.

**Running:** the owner's instance is on build 547, moved on 21 November at 09:50 Toronto time after that build passed a browser check on a test copy. A backup was taken before each move.

**Builds since the section below was written, each checked in a browser on throwaway copies:**

| Build | Source | Verdict | Why |
| --- | --- | --- | --- |
| 542, 543 | 33e099f91, 16eeae26e | No | Entity names squeezed on a phone by the new control column; the search drop-down emptied when a light's slider or colour button was pressed |
| 544 | f762c285c | Yes | Both repaired; 80 pages, no page errors |
| 545 | 775a96382 | No | A run stranded for two hours when the starting browser closed; a watching browser lost the finished summary |
| 546 | c2e5b0256 | No | The watching browser still showed an empty card until reloaded by hand; a new tab did not carry a run on |
| 547 | bb1702e32 | Yes | A watching browser shows the summary by itself; a stranded run frees itself and shows real states |

**This commit** repairs what the 547 check left: the run time in the summary after a Core update, a way forward for a stranded run with one step left, wrapped buttons kept together at the row end on phone lists, and three small display faults. Not yet seen in a browser.

**What the checks taught, worth keeping:**

- The confirmation's slider starts the run once both keys are turned. There is no separate start button.
- While Core runs the newest build only the two pretend apps offer updates on the full test copy; they offer again after a Core restart. Going back with a backup makes Core offer an update again, but the page is then served by the older frontend, which proves nothing about the newer one.
- The update queue lives in the tab's session storage. Only the same tab can carry a run on.
- A check that re-finds a button by its name after pressing it can read the wrong row, because the name changes when the row opens. Keep the element handle.
- Python tests must run detached and one at a time in the test container; the source copy alone takes about twenty minutes.

`CLOSEOUT_PROMPT.md` lists how a build reaches the owner's instance and what is open.

## State at the stop on 20 November 2026

Stopped at 23:45 Toronto time. All work is on `main`; there is no other branch, linked working tree or stash.

**Running:** the owner's instance is on build 536 (moved 20 November, 10:16 Toronto time, after a browser check). Builds 537 and 538 are published and unchecked. A build of the later source may or may not have finished; the last commit is not built.

**In source since build 536, none of it seen in a browser:**

- Polish pass (`77a7687e5`): one scroller on list pages, measured end space, wrapping names, fixed title and buttons on dialogs and sheets, floating tool pills, more search bars, action moments.
- Fourteen repairs from a browser hunt of build 536 (`b46466d28`). The hunt covered 82 pages and 656 page loads. Its worst findings were blank area pages (a template was passed where the title code expected text) and page titles stacking one letter per line on phones.
- Controls in place, "Run a quick action", "Show more details" (`33e099f91`).
- This commit: an expandable detail row in the shared data table; details and quick buttons in more lists; the states tool opening on one entity; a stop control for running quick actions backed by a small in-memory server component, `quick_action`, loaded through `default_config`.

**Python tests, run after the container engine came back:** `core/tests/components/quick_action`: 12 passed (one test was corrected: it used the websocket after the stop event had closed it). `core/tests/components/default_config`: the start-up test passes with `quick_action` loaded; its teardown then reports a missing translation `services.wake.name` for the older `wall_tablet` component, which is not a source fault: `strings.json` has the string, and the generated `translations/en.json` is ignored by design and was absent in the test copy. Generate it in the test container with `python3 -m script.translations develop --integration wall_tablet` before running that folder.

**Owner's decisions recorded on design canvas 42:** today's look with a polish, not a new look; dramatic motion and graphics for actions only; nothing removed; dashboard cards unchanged; controls in place everywhere an entity is listed; risky things ask first; details everywhere, with edit behind the two-key confirmation.

**A habit to keep:** a commit without `[skip ci]` starts a release run, and a new run cancels the one that is waiting. Mark commits that are not code, and start the build by hand once.

`CLOSEOUT_PROMPT.md` lists the next steps in order.

## Running the Python test suites, 20 November 2026

The Home Assistant and Supervisor test suites do not run on the Windows workstation directly.
They do run in throwaway containers, as follows. Nothing here needs the network beyond the
package indexes, and no container keeps state between runs.

### Core

1. Start a throwaway container from the project's published Core image with `core/` mounted
   read-only at `/src`.
2. Install the test dependencies once, pinned by Core's own constraints:

   ```sh
   cd /src
   python -m pip install -c homeassistant/package_constraints.txt \
     pytest==9.0.3 pytest-asyncio==1.4.0 pytest-aiohttp==1.1.1 pytest-freezer==0.4.9 \
     freezegun==1.5.5 pytest-socket==0.8.1 pytest-timeout==2.4.0 pytest-unordered==0.8.0 \
     pytest-xdist==3.8.0 requests-mock==1.12.1 respx==0.23.1 syrupy==6.1.1 \
     pytest-picked==0.5.1 pytest-cov==7.1.0 mock-open==1.4.0 pydantic==2.14.1 \
     paho-mqtt==2.1.0
   ```

3. Install the test helper plugin from a writable copy, without its dependencies:

   ```sh
   cp -r /src/packages/pytest-homeassistant /tmp/pth
   pip install --no-deps /tmp/pth
   ```

4. Copy the source to a writable `/core`, because some tests write into
   `tests/testing_config`:

   ```sh
   mkdir /core
   tar -C /src --exclude='__pycache__' --exclude='*.pyc' -cf - \
     homeassistant tests packages pyproject.toml | tar -C /core -xf -
   cd /core
   ```

5. Run a target:

   ```sh
   PYTHONPATH=/core python -m pytest -q -p no:sugar -p no:cacheprovider -n 4 --timeout=120 <target>
   ```

   `tests/components/linked_media` and `tests/components/camera_recording` need `-n0`.

### Supervisor

1. Start a throwaway `python:3.14-slim` container with `supervisor/` mounted read-only.
2. Install what the tests load (GitPython needs `git`, pulsectl needs `libpulse0`, pyudev needs
   `libudev1`, and the D-Bus tests need `dbus-daemon`), then the Python requirements:

   ```sh
   apt-get update && apt-get install -y --no-install-recommends git libpulse0 libudev1 dbus-daemon
   pip install -r requirements.txt -r requirements_tests.txt
   ```

3. Run a target from the Supervisor folder, with `PYTHONPATH` set to that folder:

   ```sh
   python -m pytest -q -p no:cacheprovider -n 4 --dist=loadfile --timeout=120 <target>
   ```

## Check for updates installed the Supervisor with its switch off, 19 November 2026

The owner reported that "Check for updates" updated the system while automatic updates were off.
On the live instance the Supervisor moved itself from 2026.11.0.527 to .528 and reported its own
`auto_update` setting as on.

### The fault

- "Check for updates" refreshes the Supervisor integration, which asks the Supervisor to reload its
  update information. When a newer Supervisor is found, that reload installs it at once if the
  Supervisor's own `auto_update` setting is on. That setting defaulted to on and the switches on
  the Updates page never wrote it, so it was on everywhere. The same setting also made the
  Supervisor update itself at start, on its daily check, when the beta channel was joined, and
  before a restore of a newer backup, and it updated the plugins on a schedule.
- Core and the operating system had no such path: the automatic updater installs them only when
  their own switch is on, inside the window, and "Update everything" and "Update the Supervisor
  first" only run on a press. Reading the code found no path that installs them on a check.

### The fix

- One way in for the Supervisor: its own setting now defaults to off, and Home Assistant turns it
  off whenever it finds it on (at start and on every refresh, retrying after a failure). Until that
  has worked, a check for updates does not ask the Supervisor to reload. The Supervisor is then
  installed only through its update entity, by a press or by its switch inside the window with
  the wait and the backup choice. Mirroring the switch into the Supervisor's setting was rejected,
  because that would install the Supervisor at any hour once the switch was on.
- Plugins no longer update on a schedule or at start. An install that someone started updates any
  out-of-date plugins first instead of refusing, so Update presses keep working. Missing or broken
  plugins are still installed and repaired at start.
- The Updates page shows a warning with **Turn off now** under the Supervisor switch if the
  Supervisor still reports its own setting on.
- Documentation: the "What off means" section of
  [`updates/README.md`](docs/features/updates/README.md).

### Not verified

- The Home Assistant and Supervisor Python test suites cannot run on the workstation (their
  dependencies are not installed). The new and changed tests were checked by reading and by
  compiling only.
- Nothing was seen in a browser or on a running instance. Existing installs keep the Supervisor's
  stored setting on until the new Core build runs once; in that gap the Supervisor can still update
  itself at its own start or daily check.
- With the Supervisor switch off and an older Supervisor, the Supervisor reports itself as
  unsupported ("not using latest version of Supervisor and auto update is disabled"); that message
  is unchanged and may now appear on more installs.

## Integration pass, the whole tree committed together, a release dispatched for `a3cb56d37`, 18 November 2026

This section covers the commits from `71824ce14` to `a3cb56d37` (after `6db767de3`) and the
integration look at a local build of the whole tree. Where this section and an older one disagree,
this one is newer. Feature documentation updated:
[`event-clips-and-live-recording.md`](docs/features/camera-recording/event-clips-and-live-recording.md)
(the recording check and the test clip),
[`language-modes.md`](docs/features/language-and-voice/language-modes.md) (tabbed pages),
[`entity-words-and-stacked-labels.md`](docs/features/language-and-voice/entity-words-and-stacked-labels.md),
[`guard-descriptions-and-reasons.md`](docs/features/defenders/guard-descriptions-and-reasons.md),
[`top-bar-search.md`](docs/features/interface/top-bar-search.md) and
[`whats-new-and-notes.md`](docs/features/updates/whats-new-and-notes.md).

### What is live and what is not

- **Live (hosted instance):** build 2026.11.1.524, built from `c9e3a5e67`, as the next section
  says. No record says the hosted instance has moved since.
- **Published, not live:** build 2026.11.1.525, built from `44d5a60e5`. No written result of its
  verification exists yet, so the three items not proven on 524 stay open.
- **Release dispatched, being built and verified, not live:** a release for `a3cb56d37` (Release
  workflow run 44438624121, dispatched at 20:40 Toronto time on 18 November). It was still running
  when this was written. It will be the first build that carries `6db767de3`, `71824ce14` and
  `a3cb56d37`. It is not verified and not live; the hosted instance moves to it only after a
  page-load pass and a real update run on a throwaway full hosting copy.
- Every commit in this range carries a skip marker; a push alone does not build or offer a build.

### Why one commit

`a3cb56d37` commits everything that was waiting in shared files at once, because the pieces depend
on each other. One example seen in the integration look: the camera recording manifest now loads
after the container registry integration, and Core refused to set up camera recording ("Integration
'registry_storage' not found") until the registry folder was present too. A partial commit of this
tree would not start camera recording.

### What changed

| Area | What | Commit | Documentation |
| --- | --- | --- | --- |
| State words seen and gaps closed | English mode compared with the published build: 1,474 texts on the dashboard, lists and sheets, none changed. Words an integration supplies itself borrow the common Cantonese word when the English is exactly the same; groups, schedules, calendars and cameras gained Cantonese states; the Updates page shows exactly one "What's new" button (it had lost it entirely); a 40 px upload button on the Backups page grew | `71824ce14` | [`entity-words-and-stacked-labels.md`](docs/features/language-and-voice/entity-words-and-stacked-labels.md), [`whats-new-and-notes.md`](docs/features/updates/whats-new-and-notes.md) |
| Tabbed settings pages follow the language mode | Page titles, tab labels and the breadcrumb of every tabbed settings page (`hass-tabs-subpage.ts`). Before, the title and tab row stayed English in Cantonese and both-language modes | `a3cb56d37` | [`language-modes.md`](docs/features/language-and-voice/language-modes.md) |
| Ten page captions in Cantonese | Backups, integrations, entities, devices, scenes, scripts, areas, helpers, automations and dashboards. The blueprint, energy, application credentials, roles and zone captions stay English: the Cantonese file has no block for them | `a3cb56d37` | [`entity-words-and-stacked-labels.md`](docs/features/language-and-voice/entity-words-and-stacked-labels.md) |
| Cantonese on settings pages | About 57 settings page files from the Cantonese lane (integrations, devices, entities, helpers, scenes, scripts, labels, logs, people, users, tags and others), with two new tests that check the page strings and rich values | `a3cb56d37` | [`entity-words-and-stacked-labels.md`](docs/features/language-and-voice/entity-words-and-stacked-labels.md) |
| Recording check and test clip | Each camera on the camera recording page shows its streaming program, whether it streams only through its service, the last event heard, the last clip, the last problem and the clips left this hour, with a button that records a 10 second test clip now. Two layout faults found in the look were fixed: sliders sat on top of their labels, and a failed test clip repeated its reason in both languages inside each half of the both-language sentence | `a3cb56d37` | [`event-clips-and-live-recording.md`](docs/features/camera-recording/event-clips-and-live-recording.md) |
| Defender finish work | Quality scale items done for both defenders: every step, abort and error of the config, reconfigure and options flows tested (100 percent line coverage of both config flow modules, 91 percent for both integrations together, guard modules below 95 percent); the next check and room holder sensors start disabled; validation errors translated; a missing climate entity or chosen sensor raises a repair issue that clears when it returns. Cool outdoor shutdown sends an off command again when it never went out | `a3cb56d37` | [`guard-descriptions-and-reasons.md`](docs/features/defenders/guard-descriptions-and-reasons.md) |
| Other lanes in the same commit | Transit cards, page and dashboard entry; linked media in the media browser and its two action editors; keeping live views and snapshots; sending recordings to a cloud drive; sending the problem log to a private repository; a container registry as an encrypted place for recordings and backups. The registry place is off until set up and should stay that way until its security review reports | `a3cb56d37` and the commits before it | [`container-registry.md`](docs/features/storage/container-registry.md), [`ttc.md`](docs/features/transit/ttc.md) |
| Tests kept honest | The hand-written automation editor lists name the 6 new transit triggers and 2 conditions (counts 208 and 163); the settings registry classifies the media browser's new tab key | `a3cb56d37` | none |

### What the integration look saw

The look ran two throwaway instances from the published 525 image: one with the tree's frontend
build and the tree's defender, auto update, camera recording, backup, registry and linked media
folders mounted read-only, and one with the image's own frontend for comparison. Three local
builds were made (19:03, 19:40 and 20:10), all exit 0. Both instances and their configuration
copies and credentials were removed afterwards. These are local builds of the tree, not a released
build; changes other lanes made after 20:10 are in the commit but were not in the last build.

- **English mode unchanged (390 px, dark):** the dashboard (46 texts), the Entities list (48 texts),
  the light sheet and the climate sheet read the same as the 525 image, apart from a relative time
  ("34 seconds ago" against "37 seconds ago"). The climate sheet shows "Heating . Currently 25 °C"
  twice in both, so that is not a regression.
- **Cantonese and both-language modes (390 px, dark):** the dashboard, Entities, Devices,
  Automations, Integrations, Settings home, Logs and Release notes had no horizontal overflow, no
  text cut without an ellipsis (an automatic scan of every visible text) and no page errors. State
  words showed in Cantonese and in both languages. The sheets of a light, climate unit, cover, lock,
  fan, media player, alarm, vacuum, weather entity, sensor, motion sensor, moisture sensor and person
  showed no cut text in either mode. Switching the mode from a second tab changed the open page
  without a reload.
- **Tabbed pages:** the tab labels and page titles followed the mode after the fix (seen on the
  second build, for example "Entities · 實體" with both-language tabs at 1440 px in light theme).
- **Small fixes of `6db767de3`:** exactly one "What's new" button on the Updates page, both with the
  build list reachable and with every request off the host blocked (then it shows the quiet line
  "You already have build 525" beside the button). The Entities search for "light" returned 15
  rows, each containing the word. The Settings home Backups tile was English only and was fixed.
- **Defenders:** AC Defender and Heat Defender were set up on a test climate entity through the
  config flow. The device page groups the guard switches by family ("Money: Cool outdoor shutdown",
  "People: Comfort memory" and so on). Both Now pages opened without cut text or errors.
- **Camera recording, with a demo camera:** the recording check showed every line listed above. The
  test clip button was pressed: "not saved. The home could not save the video." The streaming
  program was present, so the "program not set up" reason was not provoked; the demo camera's live
  offer failed, which gave the general failure reason. The clips left this hour went from 12 to 11
  after the failed test, as designed (a test uses one live view from the camera service). The
  slider overlap and the doubled reason were seen fixed on the third build.
- **Light theme and 1440 px:** the dashboard, Entities, Settings home, Updates, Backups, Personal
  settings and the AC Defender Now page at 1440 px, and Entities, Updates, Backups and the Defender
  at 390 px, had no overflow, no cut text and no page errors by the automatic scan. Only the
  Entities page at 1440 px was looked at by eye: a one-row top bar with readable contrast, but two
  search icons side by side (one beside the title, one in the tool group), not compared with 525.

### Checks on the tree

- Type check: only the 2 known gallery errors.
- Frontend tests, final run after the last edit: 9,588 passed, 3 failed. The 3 failures are the
  known baseline in `test/build-scripts/build-management.test.js`. Before the test list and settings
  registry fixes there were 4 more, from the transit lane and the media browser change.
- Prettier and ESLint clean on every changed or new frontend file; the template check passed on
  the three components the pass changed.
- Core tests for both defenders, camera recording, automatic updates and the backup self-check: 582
  passed, 18 failed, 9 skipped. All 18 failures were camera recording tests that write into a test
  configuration folder that was mounted read-only. Camera recording run again on a writable copy,
  with the current camera recording and registry tests: 187 passed, 4 skipped, 0 failed.
- No Python file was changed by the pass, so Ruff was not run for it.

### Known faults and gaps

- **Still English in Cantonese and both modes:** the sidebar page names (Overview, Map, Energy and
  the rest), the Backup Manager state value "Idle", and the Automations top bar title at 390 px.
- **Rows above the 64 px target:** Devices rows are 72 px (integration name plus manufacturer line)
  and Automations rows 88 px (name, last run, description). They are the same in English, so this is
  not a language regression, but they are taller than the boards ask.
- **Two search icons** in the top bar of Entities at 1440 px; not yet checked against 525 or the
  board.
- **Not seen in the look:** sorting and filtering Entities by state in each mode; a door sheet (no
  door sensor in that configuration); the History tab glide, the fan and sensor chips, developer
  tools search per tab, the 44 px hit areas, the Cantonese backup counts and the defender log
  wording; the Settings home search count (not identified); the defender reason line in both
  languages, a nested reason, pause, restart and a restored pause reason; camera event rows and a
  camera sheet that never offers Play without a clip; a light sheet in light theme, Personal settings
  with the top bar search open, the search field width at 360 px; an empty list page without a search
  button, the dashboard history commits filter, the zone condition map and the Ollama model list.
- **Not seen at all (other lanes):** the transit cards, the problem log page, the registry pages and
  the linked media rows. No real camera, cloud drive, registry or speaker was used.
- **Cantonese** of the new captions and settings pages has not been read by a native reader.

### Open list, in order

What only the owner can prove:

1. The real doorbell camera: whether its service accepts the handshake, a successful test clip and
   clips from a real event.
2. A real air conditioner or heater under both defenders.
3. USB sticks.
4. Provider sign-in round trips.
5. Cloud host sign-in.

What is still unseen (beyond the list above):

1. The three items not proven on 524 (start time on a page that did not start an update, "Update
   the Supervisor first", the release link of the build on offer): they need the verification of 525
   or of the new build.
2. Everything in "Not seen in the look" above, and the other lanes' pages.

Next steps:

1. Let the release for `a3cb56d37` finish; read it back as a normal release (not a draft, not a
   prerelease) with its expected files.
2. Verify that build on a throwaway full hosting copy: a page-load pass in the three language modes
   and a real update run, including the three items not proven on 524.
3. Only then move the hosted instance to it, and tell the owner the build number.
4. A browser pass for the items in "Not seen in the look", the transit, problem log, registry and
   linked media pages, and the two search icons.
5. Decide whether the Devices and Automations rows should come down to the 64 px target.
6. Review the new Cantonese with a native reader.
7. Ask the owner to try the camera, air conditioner and heater items.

## Build 524 live, build 525 being verified, Cantonese reaching entity words, 18 November 2026

This section covers the commits from `6e399887e` to `6db767de3` (3 commits, after the
documentation commit `c96301804`) and the real run of build 524. Where this section and an older
one disagree, this one is newer. New feature documentation:
[`entity-words-and-stacked-labels.md`](docs/features/language-and-voice/entity-words-and-stacked-labels.md);
edits to the entity sheet, top bar search, updates, backup self-check and defender files.

### What is live and what is not

- **Live (hosted instance):** build 2026.11.1.524, built from `c9e3a5e67`. Verified before it went
  live by a page-load pass (0 page errors in four modes) and a real update run on a throwaway full
  hosting copy.
- **Published, being verified, not live:** build 2026.11.1.525, built from `44d5a60e5` (it carries
  `6e399887e` and `44d5a60e5`: Cantonese on sheets and the Backups pages, the both-language tab
  bar).
- **On main, not built:** `6db767de3` (state words following the language mode, and ten small
  fixes).
- Every commit in this range carries a skip marker; a push alone does not build or offer a build.

### Seen working on 524, and what is not proven there

Seen working in the real update run of 524:

- Core updated from its row twice (2:08 and 1:52).
- A backup passed its self-check 4 of 4, and the card refreshed without a reload.
- The quiet build card: the "Update coming soon" card goes quiet once its build is installed.
- "Custom" stays selected on the backup choice.
- Release notes search marks the words it finds and steps through them.
- The developer tools tabs work after their page shell was replaced.

Not proven on 524, because each needs a newer build on offer: a page that did not start an update
showing the start time, "Update the Supervisor first" on the Core row, and the release link
pointing at the build on offer. A verification of build 525 is running to settle them; there is no
result yet.

Of the eight faults of 523 listed in the next section, four are now seen fixed (the build card,
release notes search, Custom, the self-check card), three are being verified (the three above),
and the entity sheet height glide is in 524 but was not recorded as seen in its run.

### What changed

| Area | What | Commit | Documentation |
| --- | --- | --- | --- |
| Entity sheets in Cantonese | About 240 control labels (lights, covers, locks, fans, climate, media players, alarms, vacuums, timers, weather, the details table, the related list); relative times such as "5 minutes ago" in the browser's Hong Kong wording | `6e399887e` | [`entity-words-and-stacked-labels.md`](docs/features/language-and-voice/entity-words-and-stacked-labels.md), [`entity-sheets.md`](docs/features/interface/entity-sheets.md) |
| Other pages in Cantonese | The camera timeline, the Backups overview and its dialogs, a few Updates page lines; later the Backups pages: title, "Set up backups", "Back up now", "My backups", backup types, and the Filters and More labels of every list page | `6e399887e`, `44d5a60e5` | [`entity-words-and-stacked-labels.md`](docs/features/language-and-voice/entity-words-and-stacked-labels.md) |
| Both languages on a phone | Entity sheet tabs stack English over smaller Cantonese: one row, 44 px targets, a 61 px bar in every mode (was two rows taking a third of a 320 px screen); segmented buttons keep whole words; camera timeline range chips 1 h, 6 h and 24 h on one row; related list rows 44 px | `44d5a60e5` | [`entity-words-and-stacked-labels.md`](docs/features/language-and-voice/entity-words-and-stacked-labels.md) |
| State words | On, Off, Open, Closed, Home, Heating and attribute names follow the language mode through one wrapper on the lookup (`createEntityModeLocalize`), with a table of 463 entries (the commit says about 460) checked by a test against the server's own word lists; weather weekday names follow too; English mode unchanged | `6db767de3` | [`entity-words-and-stacked-labels.md`](docs/features/language-and-voice/entity-words-and-stacked-labels.md) |
| Ten small fixes | History tab no longer jumps a second time; fan speed buttons and sensor range chips stack the two languages on one row; one "What's new" button on the Updates page; a count in the Settings home search; a list search no longer typo-matches short words ("light" no longer finds "midnight": the forgiving match waits for six letters or more); developer tools remember the search per tab; small buttons get a 44 px hit area; backup counts read properly in Cantonese; the defender log words its actions | `6db767de3` | [`top-bar-search.md`](docs/features/interface/top-bar-search.md), [`whats-new-and-notes.md`](docs/features/updates/whats-new-and-notes.md), [`backup-self-check.md`](docs/features/backups/backup-self-check.md), [`guard-descriptions-and-reasons.md`](docs/features/defenders/guard-descriptions-and-reasons.md), [`entity-sheets.md`](docs/features/interface/entity-sheets.md) |
| Repository | A one-off helper script that should never have been committed (`frontend/fix-tmp.cjs`) removed | `44d5a60e5` | none |

### Evidence

- **Real run of 524:** as listed above.
- **Browser:** `44d5a60e5` was seen in a browser at 390 and 320 px (the tab bar, segmented buttons,
  the range chips, related list rows). `6e399887e` and `6db767de3` were not seen in a browser.
- **Tests (`6db767de3`):** `entity-language-mode.test.ts` reads the server's `strings.json` word
  lists and fails on a missing, extra or untranslated entry (seven abbreviations such as RGB and
  GPS kept on purpose; scenes and buttons listed as having no words); it is skipped when the
  server sources are not in the checkout. A speed test formats 5,000 states in each mode. The
  commit records 2.3 ms in English and 3.2 ms in Cantonese. Tests for stacked labels, the list
  search and the defender wording were added or extended.

### What stays English

State words and attribute names the table lacks, including integration-specific text; lookups that
carry arguments; numbers, units, dates and durations; a handful of sentences whose blanks are
filled with links or buttons; upstream pages this work does not reach.

### Known faults and gaps

- **Not seen in a browser:** `6e399887e` (sheets, Backups overview, camera timeline in Cantonese)
  and all of `6db767de3`. The Backups pages in Cantonese from `44d5a60e5` are not recorded as seen
  rendered (inferred: the commit names only the tab bar sizes as seen).
- **Cantonese** from these three commits has not been read by a native reader.
- **Build 525** is published and being verified; nothing about it is recorded as seen yet.
- The other gaps of the next section (stepping with Enter, apps pages with a Supervisor, the zone
  map, the offline camera line, pages that keep their own search field) are unchanged.

### What only the owner can prove

- The real doorbell camera, a real air conditioner or heater, USB sticks, provider sign-in round
  trips, and cloud host sign-in.

### Next steps, in order

1. Finish the verification of build 525 and record its result here: the three items not proven on
   524, and a browser pass at 390 and 320 px in English, Cantonese and both modes on entity sheets,
   the Backups pages and the camera timeline.
2. Only then move the hosted instance to 525, and tell the owner the build number.
3. Dispatch a build containing `6db767de3`; browser pass on lists, tiles and sheets in all three
   modes (state words, attribute names, weekdays), the list search, developer tools search per tab,
   the Settings home count, the Updates page "What's new" button, and the defender log.
4. Review the Cantonese strings with a native reader.
5. Ask the owner to try the real camera, air conditioner and heater items.

## Camera events, search from the top bar, defenders polish and the real run of build 523, 18 November 2026

This section covers the commits from `17fce491f` to `c9e3a5e67` (14 commits, after the earlier
documentation commit `0d3d85d8a`). Where this section and the next one disagree, this one is newer.
Feature documentation is under `docs/features/`: the new files
[`top-bar-search.md`](docs/features/interface/top-bar-search.md),
[`event-clips-and-live-recording.md`](docs/features/camera-recording/event-clips-and-live-recording.md),
[`guard-descriptions-and-reasons.md`](docs/features/defenders/guard-descriptions-and-reasons.md) and
[`event-type-picker-and-zone-map.md`](docs/features/automations/event-type-picker-and-zone-map.md),
and edits to the updates, backup self-check, entity sheet and defender files.

### What is live and what is not

- **Live (hosted instance):** build 2026.11.1.523, built from `02dd3f9b4`. Verified by a page-load
  pass (0 page errors in four modes) and by a real update run on a throwaway full hosting copy
  before it went live.
- **On main, in no released build:** `92fb942bc`, `28cd39810` and `c9e3a5e67`. The last one fixes
  eight faults that a real run of 523 turned up (see Known faults). A release for main was
  dispatched and is **not yet verified or live**. Treat it as unbuilt until it is read back as a
  normal release and a browser pass on its image is recorded.
- Every commit in this range carries a skip marker; a push alone does not build or offer a build.

### What changed

| Area | What | Commits | Documentation |
| --- | --- | --- | --- |
| Entity sheets | Sheet as tall as its content, compact 56 px switches, valve, cover and script buttons visible in the light theme, Cantonese for sheets, a test for the fifteen helper kinds; first browser look: script Run label restored, height held off the Details tab, disabled button outline; glide between heights | `17fce491f`, `ecc3e18ef`, `c9e3a5e67` | [`entity-sheets.md`](docs/features/interface/entity-sheets.md) |
| Updates page | Automatic updates card rests as one summary row; a page opened mid-update corrects its start time; offline camera last seen; long update name ends before its button; Core row says "Update the Supervisor first"; build card quiet once installed; release link points at the build on offer | `23225de03`, `090bf8e62`, `c9e3a5e67` | [`progress-and-queue.md`](docs/features/updates/progress-and-queue.md), [`update-coming-soon.md`](docs/features/updates/update-coming-soon.md), [`whats-new-and-notes.md`](docs/features/updates/whats-new-and-notes.md) |
| Backup choice | A findable per-app row ("Apps: choose which apps get a backup first"); Custom opens the list, no longer does nothing without a Supervisor, and stays selected | `19767b529`, `02dd3f9b4`, `c9e3a5e67` | [`backup-before-updating.md`](docs/features/updates/backup-before-updating.md) |
| Backup self-check | The card refreshes by itself when a new backup is checked | `c9e3a5e67` | [`backup-self-check.md`](docs/features/backups/backup-self-check.md) |
| Camera events | Each event has its own record; Play only with a real clip; failures logged once with a reason code; clips copied from the camera service through its integration; live video recorded around events through a one-time loopback handshake address (about 40 seconds, one session per camera, 12 clips an hour); offline last seen; Light recording picker | `62c70ce1c`, `02856a9e3`, `7115ff26f`, `23225de03` | [`event-clips-and-live-recording.md`](docs/features/camera-recording/event-clips-and-live-recording.md) |
| Top bar search | Search button in the top bar; opens in the bar on Personal settings, filters in place on lists; about thirty pages moved in four commits; developer tools on the standard shell | `a5e08cb1a`, `19767b529`, `02dd3f9b4`, `92fb942bc`, `28cd39810`, `c9e3a5e67` | [`top-bar-search.md`](docs/features/interface/top-bar-search.md) |
| Defenders | One-line description for each of 51 guards; reasons worded in two languages from codes; courtesy wait setting (0 to 30 minutes, default 10); setup waits for the climate entity; two faults from a whole-day test; the courtesy wait obeyed at zero | `7cd4d5189`, `090bf8e62` | [`guard-descriptions-and-reasons.md`](docs/features/defenders/guard-descriptions-and-reasons.md) |
| Automation editor | Searchable event type picker; small map on zone triggers and conditions; timer duration written properly; threshold unit and power default fixed; first sheet field tappable; list no longer says "Unknown trigger"; one test reads the server's own descriptions | `23225de03`, `ecc3e18ef`, `090bf8e62`, `02dd3f9b4` | [`event-type-picker-and-zone-map.md`](docs/features/automations/event-type-picker-and-zone-map.md) |
| Design | Canvas 38 gains the Events board; canvas 40 is search from the top bar | `62c70ce1c`, `a5e08cb1a` | `design/canvases/38-...`, `design/canvases/40-search-top-bar` |

### Evidence

- **Real run of build 523** (the instance of the run is not recorded per item):
  Supervisor and Core updates from their rows; a backup over 1 GiB passing the self-check 4 of 4;
  Heat Defender switching a cooling unit to heat below her floor; the courtesy wait at zero; a
  pause surviving a restart; the per-app backup row; the top bar search on Personal settings.
- **Camera live recording:** proven end to end in a container against a pretend camera service:
  10.3 seconds from event to a saved 10.00 second clip, the temporary stream removed afterwards, no
  handshake text in the log. Never against a real camera.
- **Browser looks** (the build used is not recorded for each): `ecc3e18ef` (first look at the
  second batch), `090bf8e62` (second look: courtesy wait obeyed, editor taps land),
  `02dd3f9b4` (most moved search pages at phone width), `c9e3a5e67` (every moved search page).
- **Tests:** a whole-day test of both defenders on one unit; tests that fail when a reason code has
  no wording; a test that reads the server's trigger and condition descriptions; the coverage test
  for entity helper kinds (watched failing when the zone mapping was removed).

### Known faults

Faults of build 523, fixed on main in `c9e3a5e67`, tested, **not yet released or seen in a real
update run**:

- A second page opened mid-update shows no start time, and a false "skipped by your choice" backup
  line (a job list shape the page did not understand).
- Core's update is refused until the Supervisor is updated; the row now says so first.
- The build card keeps showing progress after that build is installed.
- The release link in the update sheet points at the installed build, not the one on offer.
- Entity sheet height jumps between tabs.
- Release notes search does not mark or step through matches.
- "Custom" on the backup choice does not stay selected.
- The backup self-check card is stale until a reload.

Other known gaps:

- **Not seen:** stepping with Enter in the top bar search read back; the apps pages with a
  Supervisor; the zone map; the offline camera line; most sheets in both-language mode; Cantonese
  guard reasons rendered.
- **Pages that keep their own search field** were not listed in any record (inferred: dialogs,
  pickers, filter panes, editors); no audit was done.
- **Developer tools:** the page shell was replaced; the commit calls it the riskiest edit. A per-tab
  drive was not recorded.
- **Cantonese strings** added here are hand written and were not reviewed by a native reader.
- **Quality scale:** the two defender integrations do not reach Bronze.

### What only the owner can prove

- The real doorbell camera: whether its service accepts the handshake, what its request allowance
  permits, and event clips and light recording from a real event.
- A real air conditioner and a real heater, USB sticks, provider sign-in round trips and cloud
  host sign-in.

### Remaining work

- Move the remaining pages that draw their own search field, if any belong in the top bar.
- Read the self-check, update and top bar search items above on a build that contains
  `c9e3a5e67`.
- Other work from the earlier section (Bambu Lab tray tiles, "What's new" links for Supervisor and
  operating system rows, other languages) is unchanged.

### Next steps, in order

1. Read back the release that was dispatched for main; confirm it is a normal release with the
   expected files. Record the result here.
2. Browser pass on that image at 390 and 1440 px: the Updates page (a second page opened mid-update,
   the Core row, the build card, the release link, Custom), the Backups page self-check card,
   an entity sheet across tabs, release notes search, the top bar search on several pages and the
   developer tools tabs, the camera event list.
3. Use the features that save or call the server on a throwaway full hosting copy before moving the
   hosted instance: run a real update from a second page mid-update, change the backup choice to
   Custom, and make a backup and watch the card refresh.
4. Only then move the hosted instance to the new build, and tell the owner the build number.
5. Ask the owner to try the real camera, air conditioner and heater items above.
6. Review the Cantonese strings with a native reader.

### Working rules from this range

- Commits carry a skip marker; one build is dispatched per batch, by hand.
- A browser look finds what tests do not: the blank Run button, the ignored courtesy wait and the
  tap-blocking drag handle were all found that way. Prefer it before calling something done.
- A fix is not recorded as proven until the exact failing case was run in a real build; a pass in
  tests that share the same guess proves nothing.

## Editors for every integration, progress, drafts, cameras, entity sheets and the defenders, 17 and 18 November 2026

This section covers the commits from `a7f6196c6` to `b62a3e0ef` (17 November afternoon to 18
November 06:25 Toronto time). Where this section and an older one disagree, this one is newer.
Feature documentation for each item is under `docs/features/`, in the new
[`updates/`](docs/features/updates/README.md) and [`defenders/`](docs/features/defenders/README.md)
categories and the files linked below.

### What is live and what is not

- **Live (hosted instance):** build 2026.11.1.521 when this section was written. It is now build
  2026.11.1.523; see the section above.
- **On main, not live:** everything after it, including the second backup self-check fix, the
  entity sheet passes, the camera changes and the defenders. A release for that work was
  dispatched and is **not yet verified or live**. Treat it as unbuilt until a release is read back
  and a browser pass on its image is recorded.
- The rule is that every commit carries a skip marker and one build is dispatched per batch, by
  hand; a push alone never produces a build or offers one to installed instances. Most commits
  from `0e32f6ee9` onward carry the marker; the earlier ones in this range and `900ceccca` and
  `28e6e9e7d` do not, because they asked for builds. See
  [`docs/features/hosting/release-build-wording.md`](docs/features/hosting/release-build-wording.md).

### What changed

| Area | What | Commits | Documentation |
| --- | --- | --- | --- |
| Integration editors | Tailored controls for the actions (286 integrations), triggers (51), conditions (43) and device automations (46) that integrations define; 1,576 integration folders checked by one test; Bambu Lab printer editors | `0e32f6ee9`, `a48fc170f`, `991e35fbc`, `900ceccca` | [`integration-editors.md`](docs/features/automations/integration-editors.md) |
| Setup forms | Rich controls chosen by field name and kind; time pattern, offset and geolocation trigger editors | `c86deec24` | [`setup-form-controls.md`](docs/features/setup/setup-form-controls.md) |
| Update progress | Stages, numbers, live output, honest start times and durations, "Update everything" clock, compact phone rows | `ff0eeea8e`, `3f969e067`, `28e6e9e7d`, `a5bbfa5da`, `11e60d596` | [`progress-and-queue.md`](docs/features/updates/progress-and-queue.md) |
| Update coming soon | One card for a build that is not yet published | `11e60d596` | [`update-coming-soon.md`](docs/features/updates/update-coming-soon.md) |
| Backup before updating | System updates only, every update, none, or chosen apps; one decision for the button, the queue and automatic updates | `4cb1fe589` | [`backup-before-updating.md`](docs/features/updates/backup-before-updating.md) |
| Notes and What's new | Both open the build's page on the updates log | `5fc4fbe08`, `3cdb9adac` | [`whats-new-and-notes.md`](docs/features/updates/whats-new-and-notes.md) |
| Automatic system updates | The switch that could not be switched is fixed (`systemPart`) | `a6886fe92` | [`updates/README.md`](docs/features/updates/README.md) |
| Backup progress | Stage list, per-place upload rows, live output | `15f5ff0a6` | [`backup-progress.md`](docs/features/backups/backup-progress.md) |
| Backup self-check | Light, full or off; three kinds of copy; two fixes for "0 of 4" in full hosting mode | `89f61a1cb`, `2e4885975`, `c373e6a4c`, `11e60d596` | [`backup-self-check.md`](docs/features/backups/backup-self-check.md) |
| Drafts, import, export | Autosaved drafts in a scratch Git repository; export and import for automations, scripts and scenes | `9ad0a9d54`, `117f536c0` | [`drafts-import-export.md`](docs/features/automations/drafts-import-export.md) |
| Cameras | One live view per camera; calm "limited" state with backoff 60 s, 2 min, 5 min; light recording; event clips for provider-only cameras | `327dbe009` | [`live-sharing-and-light-recording.md`](docs/features/camera-recording/live-sharing-and-light-recording.md) |
| Entity sheets | Three passes over every entity kind: slide to unlock, bars, level tiles, maps, 44 px targets, coverage test | `80af39d52`, `218279a85`, `d94590113` | [`entity-sheets.md`](docs/features/interface/entity-sheets.md) |
| Phone | One bottom bar, nothing wider than the screen, menus as bottom sheets, type caps, scrolling work | `a7f6196c6`, `6b6ac0e92`, `117f536c0`, `28e6e9e7d` | [`phone-compact-pass.md`](docs/features/interface/phone-compact-pass.md) |
| Defenders | AC Defender and Heat Defender integrations: 51 guards, shared band and handovers, the heating floor, restart memory, pages | `a5bbfa5da`, `d78560d34`, `32949f117`, `b62a3e0ef` | [`defenders/`](docs/features/defenders/README.md) |
| Release build | The project's own English wording is merged into every integration's text in the build | `7889b9ba1` | [`release-build-wording.md`](docs/features/hosting/release-build-wording.md) |
| Design | Canvas 37 (integration editors), canvas 38 (progress, drafts, entity kinds, backup-first choice, camera states and recording amount), canvas 39 (AC Defender, Heat Defender, shared band) | `0e32f6ee9`, `fcca8da65`, `73f1081fd`, `2bbd3d4af`, `bc72ce681`, `7b87d3d84`, `aa92e0171`, `32d3a7134` | `design/canvases/37-...`, `38-...`, `39-ac-defender` |

### Evidence

- Local build at 390, 360 and 1440 px (`900ceccca`): nine pages with no sideways overflow and no
  console errors, a real sign-in, ten integration actions in English and Cantonese, a running
  update with progress and output, a real local backup with its stage list.
- Local build at 390 and 360 px, light and dark (`117f536c0`): the single bottom bar and no
  sideways overflow on eight pages.
- Real run of build 519 on a phone (`28e6e9e7d`): menus clicked at 390 and 360 px.
- Real run of build 509: found the automatic-update switch fault.
- Entity sheets: one entity of each of 60 kinds used with a real pointer (`80af39d52`); third pass
  checked in a real browser at 390 px, 118 of 119 tiles open the right sheet, 33 actions hold after
  reopen, and the 37 triggers and conditions that would not save now do (`d94590113`).
- Backup self-check fix proven on a throwaway full-hosting copy with checks of other places off
  (`c373e6a4c`); 45 tests.
- Defenders: first run in a real instance caught the siblings arguing, which was fixed
  (`b62a3e0ef`); engine 76 tests.
- Test counts at the end of the range: 9,274 frontend tests passing with three known build-script
  failures (`28e6e9e7d`). Types at two known gallery errors.

### Known faults

- **Hosted build 521:** the backup self-check can wrongly read "0 of 4" in full hosting mode.
  Fixed on main in `c373e6a4c`; not yet in a live build.
- **Update row start time on a page opened mid-update:** the row says "Started before this page
  opened" and shows no running time when nothing recorded the start.
- **No live output during a Core update** in 521. Reading the Supervisor log for system updates is
  on main (`a5bbfa5da`) and was not seen on a real Core update.
- **Editor crash seen in a real run of 519:** not reproduced in five-minute idle runs, cause not
  found. The draft changes remove three weak spots but are not a proven fix.
- **Cantonese strings** added in this range were written by hand and not reviewed by a native
  reader; many were not seen rendered.
- **Entity sheets:** differences from the board recorded after the first pass (a media player shows
  volume before transport, the humidifier ring and one numeral large) were not re-measured after
  the second and third passes. Inferred: the second pass changed the bars, but this was not
  re-measured.
- **Quality scale:** the two defender integrations do not reach the Bronze level yet.
- **Scrolling:** about 16% of frames on Entities and Automations lists at 390 px with the
  processor slowed four times are still slow; the remaining cost is per-row icons and custom
  elements.
- **Update history** is kept per browser, not per instance (from the earlier section; not
  re-examined).

### What only the owner can prove

- A real provider camera: shared live view, the countdown after a real "too many requests",
  light recording clips from a real event, event clips for a provider-only camera.
- A real air conditioner and a real heater: every command the defenders send, the heating floor
  with real cold weather, the cost figures against real power use, and a real air conditioner and
  heater sharing one unit.
- USB sticks: install from USB storage, USB recovery, the offline update pack.
- Provider sign-in round trips and cloud host sign-in, tunnel, DNS and reachability from outside.
- A real cloud backup place and a real network mount for the self-check.
- An automatic system update watched happening inside its window.

### Remaining work

- Backups page per-place check results and the setting were built with a mocked backup; run them
  against a real server.
- "What's new" links for Supervisor and operating system rows.
- Tile tap actions and the light theme and wide windows for the entity sheets; touch targets
  under 44 px outside the sheets (inferred from the pass 2 note).
- Round-the-clock recording for provider-only cameras is deliberately not built (see the camera
  file).
- Bambu Lab editors: tray tiles with colour swatch, colour picker that stores the printer's text
  colour format, file picker for the job.
- Other languages for the integrations added in this repository fall back to English until their
  files are written.
- The update's own detail dialog backup switch applies to that one update only (by design, per
  `a5bbfa5da`).

### Next steps, in order

1. Read back the release that was dispatched for main; confirm it is a normal release with the
   expected files. Record the result here.
2. Run the browser pass on that image: the Updates page (rows, queue, "Update coming soon", the
   backup-first choice), the Backups page and the self-check in full hosting mode, the camera
   sheet, a sample of entity sheets, the defenders' pages, at 390 and 1440 px.
3. Use the features that save, create or call the server on a throwaway copy before moving the
   hosted instance: drafts and recovery, import, the backup-first choice, the automatic update
   switches, defender pause across a restart. A page-load pass alone has failed this check before.
4. Only then move the hosted instance to the new build, and tell the owner the build number.
5. Ask the owner to try the real camera, air conditioner and heater items above.
6. Review the Cantonese strings with a native reader.

### Working rules from this range

- Commits carry a skip marker unless they ask for a build; one build is dispatched per batch.
- A board is drawn before the feature is built, and where the build and a board differ, the board
  is the target.
- A fix is not recorded as proven until the exact failing case was run, not a guess: the first
  self-check fix guessed a value and passed tests that used the same guess; the second read the
  real value from a running Supervisor.

## Rich editors, phone sizing, automatic system updates and scrolling, 17 November 2026 (afternoon)

- **On the home instance:** build 498 (`55c0ed5bd`), moved at 10:59 Toronto time. Proven by a page-load pass and a real run on the throwaway full copy (495 to 498 with no false red on the queue card).
- **Build 503 is published but was not moved onto the home instance.** Its real run updated correctly, but Cloud host "Set up" and "Remove" failed with "could not stop the tunnel": a missing tunnel container was treated as an error. Fixed in `bd80ca4bb` (a missing container counts as stopped; Remove always ends in "not set up"). Do not press Set up on 503.
- **Waiting to be built:** `465bb72ba` and everything before it since 503: the tunnel runner for full hosting mode, a rich editor for every entity kind (colours use a colour picker, 62 domains and 247 services covered by a test), compact rows with a density setting (compact, comfortable, cosy), a phone sizing pass, the Cloud host fix, and the Updates page no longer sitting on a blank spinner after the reload that follows an update (proven by simulation only).
- **Committed after that:** `a7f6196c6` (editor redesign with one pill control, tonal step rows, scene editor parity, Home information, Network and Areas tidied, motion only for real moments, first scroll fixes) and the scroll performance work that follows it.
- **Owner decision, 17 November: Core, Supervisor and the operating system may update automatically.** Three switches on the Updates page, all off until the owner turns each on behind the two-key confirmation, inside a window (03:00 to 05:00 by default) with a wait in days and a fixed order. USB install, USB recovery and going back to an earlier build are never automatic. No automatic system update has yet been watched happening inside its window.
- **Sizing rule from the owner:** the product is used on a 390 px phone. Rows are 52 to 60 px, titles 22 to 26 px, tiles two across and short; large type and tall heroes are for wide windows only.
- **Scrolling.** Measured at 390 px with the processor slowed four times. The first pass cut the worst frame on Entities from 100 to 67 ms and on Devices from 117 to 50 ms, but about a third of frames on those two lists were still slow; the remaining cost is in the list's own per-step work.
- **Never proven for real:** an automatic system update inside its window; Cloud host sign-in, tunnel, DNS and reachability from outside (needs the owner's sign-in); the "went back to an earlier build" line; the Updates spinner fix on a real restart; the saved tick, the row editor sheet header and the queue ring in a browser.
- **Design:** canvas 36 (`design/canvases/36-rich-editors`, four boards).

## Interface polish and seventeen new features, 17 November 2026

- **On the home instance:** build 495 (`9ad470a94`), moved at 08:36 Toronto time. Before it: 481 (01:59), 487 (04:05, the polish build), 490 (06:09).
- **Design first.** Canvas 34 (`design/canvases/34-polish`, six boards) sets the look: one loud thing per page, heavy wrapping headings, big numerals, tall rounded rows. Canvas 35 (`design/canvases/35-features`, thirteen boards) draws every new feature before it was built.
- **Polish, in 487.** Shared page header with a round back button, pill tabs with a sliding indicator, list pages with one tool row, a statistics strip and rounded rows, and a new Settings front. The Backups list on a phone no longer has stray buttons in its text line and scrolls with one scroller.
- **Features, in 490 and 495.** The automation editor as one sentence plus numbered blocks, with helpers created, edited and removed in place and a working demo of each helper kind; a visual editor for every action, tailored to 28 entity kinds, with a test that fails if any type is left as only a code box; statistic tiles that filter (Entities, Devices); one shared empty state; modern dialogs that become bottom sheets on a phone; floating buttons and toasts that no longer cover content; tidied developer tools; device health; the "while you were away" digest; dry run replay over a past period; the room setup wizard; update history with going back to an earlier build; backup self-check; the Cloud host page; the offline update pack on the Updates page.
- **Proven by a real run on a throwaway full copy (build 495).** "Update everything" from 490 to 495 finished and the card said so (it was red for about nine seconds after the reload onto the new build, then corrected itself); "Update everything" asks for the two keys; going back from 495 to 490 worked; a real backup passed its self-check and "Check this backup again"; Cloud host with a Supervisor reports "tunnel runner not installed" and sends nothing anywhere; the room wizard makes a room from a name alone.
- **Lesson kept.** Build 490 went onto the home instance on a page-load pass alone, and its room wizard could not save because it sent empty floor and icon values. A page-load pass only proves pages load. A build that adds anything that saves, creates, deletes or calls the server now needs someone to use that feature on the build first.
- **Known and not yet shipped at the time of writing.** In `093dccafb` (built after 495): Escape closes the room wizard, "When When" in the editor sentence, the empty state overlapping filter chips, stale list footers, toasts over the editor bar on a phone, and six smaller layout faults, each seen fixed on a real build. Still being worked on: the follow-up line after going back to an earlier build is wrong (it never says the go-back worked and can later claim it did not finish), the nine red seconds on the queue card, cut labels on the backups pages, and making the two-key confirmation one screen instead of two.
- **Honest limits.**
  - Cloud host: container mode (`host.bat --cloud`) is real but the tunnel has never been started; in full hosting mode the Supervisor cannot launch the tunnel client yet, so "set up in one click" there is not done.
  - Offline update pack: only the operating system part installs without a network. Core and Supervisor are checked and reported as needing one. The release job that builds the pack has never run.
  - Never tried on real hardware: any USB stick, Raspberry Pi recovery, the Deploy Assistant's stick maker window, the queue's operating system step.
  - Update history is kept per browser, not per instance.
  - Backup self-check proves a backup opens and is complete, not that a restore would succeed. One unrelated existing Core test failed in the test container and was not proven to be environmental; `test_init.py` for the backup component could not be loaded there.
  - Tiles filter only where the page already had a matching filter, so on Automations, Scripts and Helpers only "Total" is pressable.
  - Cantonese strings added today were written by hand and not reviewed by a native reader.
- **Left on the throwaway copy `ham-full-queue`:** a small test integration that offers two pretend updates, a test room, automatic backups switched on, and one manual backup. Remove the container and its volume when no more real runs are needed.

## Build 478 on the home instance, 16 November 2026 (late)

- **Build 478** (`f599eaae8`) is on the home instance. Browser pass: no page errors. A look at the built app, on a separate throwaway copy, found these right: the rebuilt Updates page (headings wrap at 1440, 760, 390 and 320; the ring text sits inside the ring; "You already have build N" when the home runs the build being built; the comparison opens on the latest build alone; part bars filter); pending-update rows keep a readable title while an "Update everything" queue runs (title 603 px or more at 1440); "Confirmation drama" set to Off is stored locally and on the server, survives a reload and gives a still dialog, and Calm, Standard and Dramatic each apply; problem outlines stay off the editor's top search bar, bottom bar and the page footer; the sidebar search keeps every letter of a fast burst.
- **Seen wrong in 478, not yet fixed.** The two-key glow still ends at a visible rounded-rectangle edge at about 60 percent on Dramatic. In Cantonese mode the footer date, the "Release date" values in the comparison and the build step names stay English, and one start time is written in two date formats on the page. In both-languages mode at 1440 the To picker value is cut with an ellipsis. Expanded change detail stops about 140 px short of the card edge at 1440. A step half under the sticky search bar loses its whole outline rather than keeping the part below the bar. "Confirmation drama" has no summary tile on the personal settings page.
- **Not a product fault.** The checker reported a storage error from the framed notes page. It came from the checker's own sign-in script, which runs in every frame and touches storage inside the sandboxed frame; loading the same page in a sandboxed frame without that script raises nothing in two browsers.
- **Never run for real.** "Update everything" was only driven with pretend update states, so no real Supervisor, Core or operating system restart has gone through the queue. "Install from USB storage" does not appear on a container install, so its page section has not been seen at all; the Supervisor side passes 698 tests in a Linux container. The USB recovery step has only its 79 script checks. None of the three has been proven on a real Raspberry Pi.
- **Builds in between.** 468 (`e4e67a49a`) was on the home instance before this. 476 (`0d9211c6c`) was looked at and held back: its Updates page headings overflowed at every width, rows collapsed on a wide window during a queue, and problem outlines covered the editor's top bar.

## Updates, the update feed and the updates log, 16 November 2026 (evening)

- **Why an installed home said "Up to date" on build 439.** The update feed on the `channel` branch only moved in the last job of a manually started release run. Pushes built images and never moved it. Two changes: every code push is now followed by a manual run of the release workflow (`gh workflow run release.yml --ref main`), and a new job, "Move the update feed for Core and Supervisor", moves the Core and Supervisor entries right after the container image is published, about 25 minutes into a run. Operating system entries still move only with a finished release. Seen working on build 462: the feed named Core 462 while the four operating system jobs were still running.
- **Build 457** (`9b5bbbec2`) is a published release with 25 files; the feed moved to Core 457, Supervisor 457 and operating system 18.5.457. Browser pass: no page errors. A look at the built app found four of six earlier fixes right (phone dashboard tools dialog, selection bar, device frames, right-to-left footer order) and two wrong (sidebar search lost letters, problem badges painted over the automation editor bar).
- **Build 462** (`ef78b7991`) is on the home instance. Browser pass: no page errors. A look at the built app: the sidebar search keeps every letter at 80 ms and 250 ms a key and loses all but the first at 0 ms; problem badges no longer cover the editor bar at 760 px, but at 1440 px a badge was painted over the page footer at some scroll positions. Both are changed again in the commit that adds this note (keys are collected from the first key press in `common/type-ahead.ts`; outlines are cut to the area their element can be seen in, `visibleArea` in `common/problems/covers.ts`). **Neither has been seen in a built app yet.**
- **Change list.** `scripts/ci/make-changes-json.py` writes `changes.json` beside the feed: every release tag and the build being published, with the commits since the one before, the part of the product each touched and the explanation in English and Cantonese. Build 462 was built before this existed; the first build to publish it is the one after.
- **Updates page.** `ha-update-coming-soon.ts` and `ha-update-changes.ts` (Settings, System, Updates) show the build that is on its way with a progress bar, and compare any two versions from the change list. Logic is covered by tests in `frontend/test/data/`. **Not seen in a built app yet.** Both read public pages from the browser (the build runs of this repository and the change list); nothing about the home is sent.
- **Design.** `design/canvases/33-updates` holds six boards drawn in the design canvas: the Updates page (wide), every state of the progress card, two phone boards, and two boards for the updates log site.
- **Updates log.** A separate public repository, `Ding-Ding-Projects/home-assistant-material-updates`, publishes one page per version with plain notes in English and Cantonese and a working demo for each new feature (68 demos, each opened in a headless browser with no console errors and no outside requests), plus search, version filters, a calendar with counts per day and a comparison page. It rebuilds hourly from `changes.json`. Its `docs/feature-inventory.md` says which required site features are built and which are not.
- **Still open here.** The preview of the newest version's notes inside the product is not built. The Cantonese on the Updates page was written by the code side and has not been read by a native speaker.

## Everyday workflows, 15 November 2026

History comparison and request lifecycle changes are preserved in `8300184d2` and integrated into `main`. Six focused frontend files pass 75 tests. The deliberate stale-response negative checks fail on the old card and pass all 12 lifecycle cases after exact restoration. Published build 441 shows the selected comparison and truthful empty-earlier-period result; a populated comparison remains unverified.

The photo-reported script/condition layout follow-up is preserved in `ea0ef484b`: persistent condition results use normal flow below the summary; script mode controls stay sticky and publish their measured height to search. Published build 441 has 120 retained raw browser images/geometry records across narrow/wide views, language preferences, themes and emulated pixel densities, with zero summary/result overlaps across 60 script views. These do not prove physical Windows DPI, keyboard operation or every condition state. Strict native evidence promotion remains incomplete; no receipt was fabricated.

Core is `2026.11.1.441`, Supervisor is `2026.11.0.439`. At 05:25 UTC on 15 November, the installed image digest matched the normal release and Supervisor reported healthy and supported. Backup `d491cebb` restored into an empty isolated folder with 344 of 344 file hashes matching, five settings files and all three repository history checks passing. That folder was not booted. Fresh pre-update backup `b4f01fad` completed at 05:21:36 UTC, 36.37 MB, partial Home Assistant only.

The owner subsequently authorized normal build/update delivery. The supported Supervisor updater applied Core 441 and independent version, image, health and LAN checks succeeded. No button-click verification is claimed. The scoped normal release is `v2026.11.1.441`, bound to `394771b0f4b4afbd8562777c9abfb47c9c1d97ad`; its three assets were downloaded and hash-verified. Other-machine and appliance versions were preserved.

Existing guided setup drafts, account-owned settings synchronization and backup inclusion of automation/dashboard history folders are implemented. Verify them instead of reconstructing them from older unchecked roadmap entries. Retain the unfinished Raspberry Pi recovery branch and pre-existing untracked browser scripts.

## Uploaded and selected backup hosting, in progress

The owner requested both hosted-copy actions on every backup, plus **Host a backup** in the desktop assistant with native archive/ZIP upload and all five existing targets. The selected hosting computer is the current computer. Preserve original automation activity; do not silently pause restored automations.

Native admission, job ownership, SSH identity, protected restoration, Core pairing and both archive exclusions, frontend actions, native upload controls, explicit SSH approval and bounded Pi addresses are integrated source. Independent source review closed the six earlier transport/admission/cancellation findings for their observed conditions. The new workflow is not in live build 441. Bootstrap composition, immutable helper publication, new Core/Supervisor delivery, native packaging, final tests and actual restore/link verification remain pending. A source-only or fail-closed result is not usable target proof.

### Current local verification

Core hosting tests pass 57 cases and Supervisor archive exclusion passes 29 selected cases. The latest native selection passes 99 cases under Node 22.14.0. Frontend hosting helpers and real dialog-manager lifecycle checks pass nine cases; native renderer checks pass 12 cases. These are focused selections, not a complete-project green verdict.

The rebuilt Core 444 dialog from `70cada969a2130d7d09999c09a5ebeafa1ced5e2` renders correctly in all 24 list/details, container/appliance, width and language combinations. Earlier empty-dialog captures remain preserved separately. Actual Core owner and nonadministrator access checks also passed in a fresh fixture.

The native caption boundary is verified with actual narrow/wide native views, including scrolling, a menu and a tall dialog. Official `./backup.json` and effective PAX sizes now pass the importer while unsafe paths and canonical duplicate names remain rejected. A tiny PAX reproduction and the real unchanged synthetic ZIP both pass intake.

One synthetic job, `1285e5e4-76be-484e-b34f-57eddaf4ef33`, created one full-mode Docker instance using the selected wrapper `2026.11.1.439` and port `18137`. The original fixture automation was on before backup. The same job successfully resumed after a controlled cold start and waited for first-run readiness. Upload then received an unrecorded non-2xx response, with no backup identifier or restore submission. The destination remains idle with zero backups. Its container and both volumes are retained; do not recreate it or replay an uncertain restore.

The latest diagnostic candidate preserves only validated numeric HTTP status and a fixed operation stage, requires the receiving backup manager to be idle, and does not add automatic POST retries. Its historical rejection cause remains unknown. A single controlled same-job diagnostic resume is pending.

### Delivery blockers and retained boundaries

The complete publication scan at `0185886eba7dab95154f208bdfd49d68a2f4469e` traversed the tree but returned 8,731 findings: 7,328 source-language matches, 477 path matches and 926 unsupported encodings. Independent current-change review found no confirmed new language leak; the one added-line match was a literal filesystem-tool command. This does not clear the remaining baseline or authorize blanket exceptions. The owner has been asked whether to expand that separate review or retain this feature scope with publication blocked.

No new Core/Supervisor/native release or accepted installation update has been performed. The helper is built locally but its immutable registry descriptor remains unpublished, so appliance availability is deliberately false. VirtualBox, VMware and Pi runtime, complete restored automation state and the new instance's LAN acceptance remain unverified. Keep the original active automations; never substitute a hidden pause.

Private runtime evidence retains exact source, image/ASAR, process/profile and pixel bindings. Native images exposing the profile footer stay private. The browser's exact page plus causally related worker is documented, while the strict one-entry website-promotion check remains unverified. A proposed task-owned Lowlevel HTTP-service launch was automatically rejected; it was not retried through another route. Existing supported hidden-desktop native operations remain separately evidenced.
## Raspberry Pi first boot and backup progress recovery, 13 November 2026

- This recovery branch preserves the Raspberry Pi source changes ahead of a complete
  appliance build. It is separate from the release branch while verification is pending.
- Release-pinned Raspberry Pi 3, 4, and 5 images select the matching ARM64 Core image and
  retain the preparation image as a fallback. The staging filesystem grows for these
  builds and is shrunk before packaging. Other boards and unpinned builds keep the
  previous image selection. Mocked registry and image staging checks covered the three Pi
  pins, the fallback, and platform validation. A full build, packaged image size, and a
  physical boot remain unverified.
- Deploy Assistant records the verified write before checking the network. It checks for
  the Core onboarding response or Core manifest and can recheck a confirmed address
  without rewriting media. A reachable Core may still need its owner account. Discovery
  does not establish hardware identity. All 29 Deploy Assistant tests passed with mock
  transport and synthetic writer results. The desktop package and rendered flow still
  need verification.
- Backup upload and restore progress was investigated in onboarding and Settings. No
  implementation is present in this recovery branch. Use browser request byte progress
  during upload, then wait for server confirmation. Show the actual restore stage and
  reconnect state, with an indeterminate indicator when no measured total is available.
  Treat an explicit completion result as evidence of success. The Core adapter also
  needs tests for the Supervisor's five renamed restore stages on both live and resumed
  jobs. Verify the two flows using synthetic backups and restart cases.
- The deployed project demo from `69f0bbfc3c4f3b0ac14f8faefd9c6b6293fe331d` and
  normal release `v2026.11.1.431` are the latest verified baselines for this recovery.
  Preserve the release channel branch. Verify an exact published successor on an
  isolated browser instance and confirm a recoverable backup before updating live Core.

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
  advertised Core and operating system build 429. The normal [build 431 release](https://github.com/Ding-Ding-Projects/home-assistant-material/releases/tag/v2026.11.1.431)
  was published at 23:06:58 UTC. All 25 downloads matched the build output by size and SHA-256.
  Channel revision `eeb6c3fdd909339eeb4b907d736db270e36faa47` advertises build 431.
- The published demo uses the same source as Core 431. It verified the speech, media, manual
  event, and dashboard editors with sample data. All 120 documentation routes responded.
- The demo's later browser loader update, `9249faf8fcf5c442502fb47c1caf15f0024a0c05`, includes
  both supported bundle types. Published WebKit checks opened speech Options and verified fixed
  bottom navigation through both legacy and modern routes at phone width.
- A separate exact-image check on Core 431 verified JPEG-to-PNG conversion, preserved and
  downloaded the original, and cancelled an intercepted stalled upload. A synthetic light action
  also offered effects from the capable target when a basic light was selected alongside it.

## Additional visual selectors, 13 November 2026

- Update item and Remove item use live item names from one readable to-do list and store
  the selected item IDs. Both item-read commands check entity read permission. An empty or
  unresolved target leaves manual entry available.
- The ONVIF PTZ action reads cached presets from camera state. Sensibo Climate React offers
  known fields and operating modes common to the selected units. The fallback dashboard
  editor has icon and navigation pickers and keyboard ordering for compatible entity lists.
- The browser demo can simulate updates and removals on a sample to-do list. Changes to the
  automation configuration stay in the browser. The local build from `b288cdb27626caea30dcaf1914fb81fc3f8d9b42`
  saved and ran the sample action, completed Milk, and reduced the list count from three to
  two. The 360 px dashboard check saved and reopened the exact values and retained keyboard
  focus when moving an entity. The full frontend suite recorded 7,858 passes and the same
  three Windows build-management failures. Two existing gallery imports still fail the type
  check. Deployed demo and exact published Core acceptance remain separate.

The later action-field changes add range-aware Number inputs, calendar controls for values
the native pickers can represent, and the six Yamaha menu commands. Existing numeric strings
stay in the saved action until edited. Noncanonical date strings and timezone-bearing values
retain text editing. Browser verification for this batch is recorded separately.

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

- Build 2026.11.1.437, 13 and 14 November. The container engine on the host had stopped;
  it was started again, the browser pass on the published image had no page errors (84
  captures), and the live instance moved to 437 at 23:51 Toronto time on 13 November.
  Release `v2026.11.1.437` was read back as a normal release.
  - Used for real on a throwaway instance of that image and seen working: automatic updates
    (a row switched on installed by itself and read "Updated automatically at 23:55";
    "update everything" installed the rest; kept over a reload; no overflow on a phone),
    "Continue on error for all actions" (saved YAML carries it on all seven actions including
    nested ones; "Some actions" when they differ; removed from all when switched off), the
    visual dictionary editor (all entry types, Visual and YAML in step, invalid YAML refused,
    rows stack on a phone), the automation bar as a footer clear of the side pane, dark theme
    edges, table toolbars and phone device rows. The protected rows of automatic updates
    could not be seen there (no such update entities in the demo set).
  - Seen wrong in 437, not fixed: the automation tools sheet on a phone stops its content
    about 168 px above the bottom of the sheet, so the flow view cuts its fourth node and
    other tools have a card or button cut (`ha-automation-tools-panel.ts`, the stage's block
    size against the dialog's); the session clock on a phone is right on the Devices page
    but sits on the bottom bar on the home page and over a card on Settings
    (`attention-modes.ts`, `home-assistant-main.ts`); the storage page shows "NaN rows" for
    an entity and in the growth line; the Lights page shows its title three times; the
    label of the continue-on-error switch does not toggle it; the bar's status text wraps to
    three lines with the side pane open. History has no "compare with an earlier period"
    control.
  - README pictures: six are from build 437 (the Updates page is new). A first set taken by
    a helper was thrown away unused because its test home carried an unsuitable name.

16 November 2026, interface lane (all times Toronto, 24-hour):

- `main` was brought together: 49 local commits from another lane were merged with the remote
  (`2401855d9`), then three branches with conflicts were merged (frontend recovery, Raspberry Pi
  first boot, early automation dictionaries; `46fed6a19`). Where both sides changed the same
  interface file, the `main` side was kept; record files kept both.
- Cleanup: a full archive of the repository and every linked checkout was written to the owner's
  cloud folder and read back (207,757 files) before ten merged remote branches, eight local
  branches and seven linked checkouts were removed. `main` and `channel` stayed. Other branches
  were pushed again later by other lanes and are theirs.
- The instance on the home network moved to build 448 at 10:12 and to build 449 at 11:17, each
  after a browser pass on that exact image.
- Recheck in build 449. Seen right: the continue-on-error label toggles its switch, the storage
  page has no "NaN", the Lights page has one title, the save bar's buttons clear the side pane,
  the wide tools dialog keeps one height, flow nodes fit the width. Seen wrong: the phone tools
  sheet stopped 244 px above its bottom edge, the clock chip sat inside the phone's bottom bar
  and inside the side pane on a fresh wide load, and the save bar's status text was cut with the
  pane open.
- `945c90a5f` fixes those three (the sheet keeps only the device's own bottom inset; the chip is
  placed again after load; the bar's hint hides when the bar is narrow). It also replaces the
  plain browser selects and inputs of the backup hosting dialog with the product's own, and
  brings the bundled changelog list back in step with `CHANGELOG.md`. Full suite: 8,019 pass,
  the 3 known build-script failures remain. These fixes have not yet been seen in a built image.
- Open: `/config/camera_recording` answers "Unknown command." in build 449 and Settings search
  does not find it. The release run for `46fed6a19` is the first to use the changed Raspberry Pi
  image build (6 GB data partition, preloaded Core); if its Pi jobs fail, that build-script
  change is the thing to revert. `dialog-host-backup.ts` still has six lint errors (braces,
  `const`) that were there before this lane touched it.

- Build 453 (`d114bb8b9`) was seen in a throwaway copy before the home instance moved to it at
  12:46: the phone tools sheet now reaches the bottom of the sheet (content ends 16 px above
  the screen edge at 390 and 320 wide), the clock chip clears the phone's bottom bar and the
  side pane, the save bar's status text is whole at 1440, 1100 and 900 wide, the camera
  recording page shows its empty state with a "Set up recording" button, and the backup
  hosting dialog draws the product's select and fields. The full browser pass had no page
  errors. Left as it is: on a phone the clock chip floats over the bottom edge of a card on
  the home, Settings and editor pages.
- A look at features never seen before, in build 449: dashboard checkpoints, "Replay a day",
  "Make phone friendly" and the History comparison work on a wide screen; no page scrolls
  sideways at 320 px. `915c77f71` fixes what that look found wrong (breakpoint dots that never
  appeared, the dashboard tools on a phone, the editor bar at 320 px, the phone History
  toolbar, English text runs in a right-to-left page); those five are not yet seen in a built
  image. Settings search did not offer pages inside the cards (for example Camera recording);
  the next commit makes it offer them.
- Build 455 (`0622bb442`) had a full browser pass with no page errors and the home instance
  moved to it at 14:36. All four operating system images of the build 453 run, the three
  Raspberry Pi boards included, built with the 6 GB data partition and preloaded Core. Seen
  right in 455: breakpoint dots beside action steps, the editor bar at 320, 390 and 760 px,
  the phone History toolbar, and Settings search offering "Camera recording". Seen wrong, and
  fixed in the commit after it (not yet seen in a built image): the dashboard tools subtitle
  cut off on a phone, the selection bar floating over the search box, device frames wider
  than the dialog with no way to scroll, the footer's label, date and alignment in a
  right-to-left language, the sidebar search losing its first typed letter to the command
  palette, and problem badges painting over the editor bar at 760 px (a best guess at the
  stacking). Typing in the Settings search itself does not trigger shortcuts.
- The release workflow publishes a release page only when it is started by hand; pushes keep
  their container and operating system images. The newest release page is `v2026.11.1.441`.
- Still open: Cantonese and both-languages modes translate only the shell (about 7 of 70
  strings on the Settings page), because the list of translated keys is short. The automation
  editor has no checkpoints; only the dashboard editor has. Arabic was not tried.

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
left only on one machine. The goal is fixed: every board built and matching (616 boards on 40
canvases on 18 November 2026, counted from the folders; 237 on 18 canvases when this was written).
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
