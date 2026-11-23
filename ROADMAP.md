# Roadmap

The goal is fixed: **every board in `design/canvases/` built into the product, 616 boards on 40
canvases (counted from the board files ending `.dc.html` and the canvas folders on 18 November
2026; canvases 16 to 20 are the Deploy Assistant), and the running product matching its board.**
This file lists all of it and is the authoritative state. `HANDOFF.md` says what is live and what
is being verified; `docs/feature-status.md` is the older row-by-row record up to 13 November 2026.

- `[x]` finished and seen working in a running build
- `[~]` partly built; the line says what is missing
- `[ ]` not finished: either not started, or built and not yet seen in a running build (the line
  says which)

Nothing is deleted from this list. An item that is dropped is struck through with the reason.

## Grow light helper, 23 November 2026

- [ ] Grow light helper: a plug on for set hours each day; any listed door turns it off, and
      closing the door turns it back on only inside the on hours. Schedule switch, Status and
      Next change sensors, setup and options steps
      ([`grow-light.md`](docs/features/automations/grow-light.md), boards in
      [`design/canvases/43-grow-light`](design/canvases/43-grow-light/README.md)). Window tests
      pass; behaviour tests need the Linux test environment; not yet seen in a browser.
- [ ] PC screen layout from the Desktop board: "Light today" total and the recent changes list
      need history reading; not built.

## Fixes from the home problem log, 23 November 2026

- [ ] Cast: a device that cannot connect back to Home Assistant no longer raises on every
      dashboard request or retries on every reconnect; one warning per outage. Unit-tested;
      not yet seen on the real Nest Hub.
- [ ] Live clips for cameras that need a data channel (Nest): the offer is reordered and given a
      data channel, and the answer is mapped back. Unit-tested; not yet seen on the real
      doorbell ([`event-clips-and-live-recording.md`](docs/features/camera-recording/event-clips-and-live-recording.md)).
- [ ] Not code: the TTC alert sensors over 16 KB, the renamed Proxmox integration in the
      app-update automation, the HomeKit 150-device limit and the missing Nest Hub entity are
      settings in the home's own configuration.

## Current checklist, 22 November 2026

Work through these items in order. The existing roadmap below started this pass with 95 checked,
87 partial and 174 unchecked rows. Some rows describe the same behavior at different releases.
For each visible change, record the build, the action taken and the observed result before ticking it.

- [x] Verify the release and update feed. The published `v2026.11.2.548` tag resolves to
  `7650c522a5e2bae90ac9f817e7853360cd78b2dd`. The normal release has 29 attachments and the stable
  feed offers Core `2026.11.2.548` and Supervisor `2026.11.0.548`.
- [x] Audit release-note links. All 149 release descriptions were inspected. None links to its
  version page on the updates website. Of 130 product builds, 68 have a matching page that
  returned HTTP 200 and 62 returned 404. The other 19 releases are for Deploy Assistant.
  The bundled changelog has 258 source links and 16 links to product screens. This was a coverage review.
- [x] Compare the two stock builds in a browser. On each build, 82 navigations returned HTTP 200
  and reached 80 distinct screens. Thread settings emitted two uncaught `unknown_command` responses
  on each build when the Thread integration was absent.
- [x] Exercise the Core update and its watcher. The backed-up isolated Core went from 547 to 548.
  The initiating browser displayed 2:24 for three steps. The independent watcher displayed the
  finished summary and sent zero install calls. Both browsers ran the published 548 frontend.
- [x] Recover a stranded run. After the initiating browser closed, the observer offered the
  one remaining update by name after 322.99 seconds. Using that action completed the update.
- [x] Check narrow rows on 548. At 360 px the trailing controls stayed together on 13 entity rows
  and three Blueprint rows. Hiding Details preserved all three Use buttons. Restoring the column
  brought all three Details buttons back.
- [x] Verify the rebuilt Thread panel. The lifecycle test reproduced the premature request and
  passed after the repair. On the isolated 548 backend, the candidate frontend rendered all three
  empty-network headings and sent zero Thread commands in 49 outgoing WebSocket messages. The
  candidate passed 82 navigations covering 80 distinct screens with zero uncaught exceptions.
- [ ] Publish the repaired source through the normal release process and verify that release on
  the isolated installation. The existing public 548 release predates the Thread repair.
- [ ] After the candidate passes, verify a backup, update Supervisor then Core on the existing
  installation, and read back both versions and the disabled Supervisor self-update setting.
- [x] Offer quick controls in History for a directly selected live entity. On the local production
  frontend, all six language/width combinations changed the synthetic switch by keyboard while
  the recorder and chart kept the same three historical samples. The bilingual heading wraps at 360 px.
- [x] Offer quick controls on the States tool's own entity rows. All six browser cases operated
  the correct switch, filtered to a read-only sensor and restored the correct row. The original
  360 px case overlapped the entity ID by 9.33 × 16 CSS pixels. On the revised wheel, the
  identifier and switch had zero intersecting text lines in all six cases.
- [x] Expand a Tags card to read its details. In all six language/width combinations, the keyboard
  toggle opened one tag, filtering retained the other tag's independent disclosure state, and
  neither card opened its editor.
- [x] Expand an Areas card to read its details. All six browser cases checked the disclosure,
  the edit button and normal navigation separately. Dragging an area within its floor and across
  floors also persisted after reload on the synthetic installation.
- [~] Refresh the public website's light and dark lead images. Both shots come from the accepted
  547 package with synthetic household data. The isolated website preview served both themes at
  360 and 1440 px and kept the keyboard-selected theme after reload. The published 547 English
  and Cantonese release notes and their interactive watcher demo also passed. Deployment of
  the new lead images and their public readback are pending. The local documentation build
  produced 162 guides. All three published wiki pages were accounted for, including both full
  editor articles. All 11 internal wiki links and their target sections worked at both widths.
  The live deployment serves 161 guides. Its 813 internal article links resolve, but the newer
  Quick actions guide returns 404. Release-tag deployment was rejected by the main-only
  environment in run `44927006063`. The local workflow now requests publication on main.
  Five routing cases and the workflow syntax passed locally. A successful hosted run is pending.
  The wiki home was published separately at `52672e6b7f40c0a929cae88e671b0347be6a06c9`.
  The updated local documentation contains that home and both full articles. Its 13 wiki
  links were exercised at each width, and all 824 internal article links and anchors resolved.
- [x] Repair the two gallery type diagnostics on Windows. The gallery page generator now resolves
  the sidebar module and creates portable page IDs. `pnpm run lint:types` generated the missing
  index and passed both TypeScript projects. Two generations in one process produced identical
  output covering all 114 distinct pages.
- [x] Verify build-process ownership on Windows. The native process creation time identifies the
  actual owner. A live process with an older, unverifiable record retains its lock. Graceful
  exit removes the lock and the next acquisition recovers a lock left by forced termination.
  All eleven build-management and process tests passed, including a competing gallery build,
  incomparable process clocks and ownership during compiler handover. The recorded PID matched
  the native `tsc.exe`. After its coordinator was stopped a competing invocation was rejected.
  Both type projects passed after the process exited and the next invocation released the lock.
  The Linux ownership checks passed too.
- [ ] Reconcile the remaining roadmap in its existing order, beginning with choosing the log
  destination while signed in. Keep checks that need a real device open until the device is exercised.

## Seen in a browser on builds 531 and 532, 20 November 2026

These items had no line in this file before. A box is ticked where the build it was seen on is
recorded; everything else stays unticked with its state.

- [x] Integrations list export and import. Seen working in a browser on build 531.
- [x] Settings of one integration, export and import, with sign-ins left out. Seen working in a
      browser on build 531.
- [x] Checking for updates installs nothing. Seen in a browser on build 531.
- [x] Problem log: names hidden in the preview. Seen working in a browser on build 532.
- [ ] Choose the private destination from the problem log. On stock 547 the isolated installation
      reported signed out, device sign-in unavailable, the chooser absent and Save token disabled.
      A genuine authorized test-provider sign-in is still needed to exercise the chooser.
- [x] Saving space: bringing a pointer back to a whole backup. Seen working in a browser on build
      531.
- [x] Saving space with the registry not reachable: the page shows the unreachable state, Bring
      back stays offered, and the success line is shown after a bring back. Seen in a browser on
      build 532.
- [ ] Saving space with the registry not reachable: the backups whole on this disk appeared about
      2 s after the pointer row (fault seen on build 531 or 532). The list now waits for the backup
      list instead of showing the pointer row alone, and `backup/pointer/info` now returns
      `local_backups` (name, date, size) within its 10 s limit so the page shows those rows at
      once and replaces them when the full list arrives (source and tests only, not seen).
- [x] The four games of the super confirmation (whack-a-mole, four in a row, the coin and the
      cookie) completed by keyboard. Seen working in a browser on build 531.
- [x] The super confirmation's Cancel. Seen working in a browser on build 532.
- [x] Four in a row shows all seven columns at 390 px and at 360 px. Seen in a browser on build
      532.
- [x] The import chips wrap instead of running off the screen. Seen in a browser on build 532.
- [x] The Sign-ins switch of an export is disabled when there are no sign-ins. Seen in a browser
      on build 532.
- [x] Escape closes the super confirmation at once. In stock 547 the first key button received
      focus on opening. Escape was the first key pressed and closed the dialog within 14 ms.
      The isolated test recorded zero install or backup calls.
- [x] "Updating 2 of 2" during "Update everything" in a second browser that opens the page during
      the run. On build 548 the observer opened Updates 92 ms after the driver started, while step
      one was active. The observer showed the second item's name and "Updating 2 of 2" during its
      actual installation. The driver sent two install calls and the observer sent zero. See
      [update progress](docs/features/updates/README.md).
- [x] The bilingual Integrations title wraps at 390 px. On stock 547 all 12 English letters
      stayed on the first line. The separator, nonbreaking space and both Cantonese characters
      shared the second line and fit inside the 178 px title.

## Integration pass and a release dispatched for `a3cb56d37`, 18 November 2026

The hosted instance still runs build 2026.11.1.524 (no record says it moved). Build 2026.11.1.525
is published; its verification has no written result yet. A release for `a3cb56d37` (the first
build to carry `6db767de3`, `71824ce14` and `a3cb56d37`) was dispatched at 20:40 Toronto time on
18 November and is being built and verified; it is not live. A box is ticked below only where the
integration look saw it on a local build of the whole tree (the last one made at 20:10, before the
commit); none of this is seen in a released build yet. Details in `HANDOFF.md`.

### Seen on the integration build

- [x] English mode unchanged: the dashboard, the Entities list, the light sheet and the climate
      sheet read the same as the 525 image at 390 px in dark theme.
- [x] Cantonese and both-language modes at 390 px: the dashboard, Entities, Devices, Automations,
      Integrations, Settings home, Logs and Release notes with no overflow, no cut text and no page
      errors; thirteen kinds of entity sheet with no cut text in either mode.
- [x] Switching the language mode from a second tab changes the open page without a reload.
- [x] Page titles, tab labels and the breadcrumb of tabbed settings pages follow the language mode
      ([`language-modes.md`](docs/features/language-and-voice/language-modes.md)). Fixed during the
      look and seen on its second build.
- [x] The camera recording page: sliders no longer sit on their labels, and a failed test clip
      gives its reason once per language in both-language mode. Fixed during the look and seen on
      its third build.
- [x] The recording check of a camera (streaming program, service only, last event, last clip,
      last problem, clips left this hour)
      ([`event-clips-and-live-recording.md`](docs/features/camera-recording/event-clips-and-live-recording.md)).
      Seen with a demo camera only.
- [x] AC Defender and Heat Defender set up through the config flow; the device page groups the
      guard switches by family; both Now pages open without cut text or errors. A test climate
      entity, not a real unit.
- [x] Light theme at 1440 px. On the rebuilt 548 frontend, all seven screens were inspected:
      Dashboard, Entities, Settings home, Updates, Backups, Personal settings and AC Defender Now.
      The light detail sheet kept its brightness, power and colour controls inside the window.
      On Personal settings, opening search by keyboard and entering `sound` found five matches
      at both 1440 and 360 px. The input measured 360 and 248 px respectively, with 218 and
      94 px available for text. Clear, Pattern workbench and Close were reachable at 360 px.
      Escape closed search. All ten views had zero uncaught errors and zero horizontal page overflow.

### Verification of the remaining items

- [x] The test clip button saved a real H.264 recording from an isolated synthetic camera
      streaming colour bars. The downloaded MP4 contained 10.000 seconds at 320 × 240, 15 fps.
      The normal recording card reported the saved clip. Disabling the test instance's streaming
      program showed “Not set up” and disabled the button. Re-enabling restored “Set up and ready”
      and the button without a restart. Physical doorbell compatibility is tracked separately.
- [x] Ten page captions and the Settings home Backups tile passed in all three language modes
      on the repaired local build. The Dashboard breadcrumb already read 儀表板, but the visible
      heading used a separate untranslated key. The repaired heading now reads **儀表板** and
      **Dashboards · 儀表板** in the corresponding modes. The browser checked 33 labels and matched
      168 scripts to wheel `49ed6a6b8729`. Blueprints also has Cantonese text. Energy, Roles
      and Zones displayed English. The empty Application credentials view displayed a summary.
- [~] Cantonese across the settings screens. The original change added the language controller
      to 58 source files in 26 settings directories, including nine dialogs. The reader checklist
      identifies 625 distinct literal wording keys and 90 dynamic call sites. Individual screen
      interactions, dynamic wording and review in context by a native reader are still outstanding.
- [~] Defender quality checks. Both AC and Heat rejected invalid setup, reconfiguration and
      options values and accepted corrected values in the six normal dialogs. Their Next check
      and Who holds the room sensors started disabled. Removing each synthetic climate or room
      sensor raised its own Repairs entry and restoring it cleared the warning. The two alerts
      still read in English for `zh-Hant`. The local AC source now obtains real hourly weather,
      retries an eligible off decision when its actuator returns and withdraws an unsent decision
      when the forecast warms. Browser validation in the requested non-English language and
      physical equipment checks remain open.
- [x] The defender reason line and its nested explanation appeared in English, Cantonese and
      bilingual mode. AC Defender reported a 23.0 °C target and the 1.0 °C wall adjustment.
      Pausing for two hours saved the owner pause reason and its exact deadline. Both were
      identical after the isolated Core service restarted. The fixture was restored.
- [ ] Camera event rows, and a camera sheet that never offers Play without a clip. Not seen.
- [ ] The transit cards and page, the problem log page, the registry pages and the linked media
      rows (other lanes in the same commit). Not seen. The registry place stays off until its
      security review reports.

### Faults found by the look, not yet fixed

- [ ] Still English in Cantonese and both modes: the sidebar page names, the Backup Manager state
      "Idle", and the Automations top bar title at 390 px. The page names in the page tab strip
      came from a list built with plain English text; it now follows the language mode, as the
      older sidebar already did (source only, 20 November, not seen). "Idle" came from the shared
      backend state words, which a sensor state cannot borrow from a generic entity word; such
      integration states now take the shared Cantonese word when their English is exactly the
      shared word (source and tests only, not seen). The Automations top bar title is not fixed:
      reading the code, the title, the narrow title and the tab names all go through the language
      mode and have Cantonese text, so the English title seen at 390 px is not explained yet.
- [ ] Devices rows are 72 px and Automations rows 88 px, above the 64 px target (the same in
      English).
- [ ] Two search icons side by side in the Entities top bar at 1440 px. Not yet compared with 525
      or the board.

### Release and process

- [~] Build 526 was published on 19 November for `a3cb56d37`. Its normal release was read back
      with 29 attachments. A three-mode browser check, real update run and move to the hosted
      instance for that exact build are unverified. Later builds have separate results.

## Build 524 live, build 525 being verified, Cantonese reaching entity words, 18 November 2026

Build 2026.11.1.524 (built from `c9e3a5e67`) is what the hosted instance runs. It was verified
before it went live by a page-load pass (0 page errors in four modes) and a real update run on a
throwaway full hosting copy. Build 2026.11.1.525 (built from `44d5a60e5`, so it carries
`6e399887e` and `44d5a60e5`) is published and being verified; it is not live. `6db767de3` is on
main and in no build. Feature documentation:
[`entity-words-and-stacked-labels.md`](docs/features/language-and-voice/entity-words-and-stacked-labels.md)
and the verification sections of the files linked below.

### Seen working in a real run of 524

- [x] The hosted instance runs build 524, verified by a page-load pass and a real update run on a
      throwaway full hosting copy first.
- [x] Core updated from its row twice (2:08 and 1:52).
- [x] A backup passed its self-check 4 of 4 and the card refreshed without a reload.
- [x] The quiet build card: the "Update coming soon" card goes quiet once its build is installed.
- [x] "Custom" stays selected on the backup choice.
- [x] Release notes search marks the words it finds and steps through them.
- [x] The developer tools tabs work after their page shell was replaced.

### Not proven on 524 (need a newer build on offer; a verification of build 525 is running)

- [~] A page that did not start an update shows the update's real start time. On 548 a late
      observer showed the shared run's start as 21:44 for a recorded start of 21:44:12.285 UTC.
      The individual Supervisor job start and backup-choice attribution still need a separate check.
- [ ] The Core row says "Update the Supervisor first". Being verified.
- [x] The Core update sheet links to the offered build. On stock 547 the offer was 548 and
      the visible release announcement linked to 548. The installed-build button on the
      same Updates page pointed to 547.

### Cantonese and both languages (build 525, published, being verified)

- [ ] About 240 control labels on entity sheets in Cantonese (lights, covers, locks, fans, climate,
      media players, alarms, vacuums, timers, weather, the details table, the related list), and
      relative times such as "5 minutes ago" in the browser's Hong Kong wording (`6e399887e`). Not
      seen in a browser.
- [ ] The camera timeline, the Backups overview and its dialogs, and a few Updates page lines in
      Cantonese (`6e399887e`). Not seen in a browser.
- [~] Both-language mode on a phone (`44d5a60e5`): the entity sheet tabs stack English over
      smaller Cantonese in one 61 px bar with 44 px targets; segmented buttons keep whole words; the
      camera timeline range chips sit on one row; related list rows reach 44 px. Seen in a browser
      at 390 and 320 px; not yet seen in a released build. The fan speed buttons and sensor range
      chips still wrapped (fixed in `6db767de3`, below).
- [ ] The Backups pages in Cantonese: title, "Set up backups", "Back up now", "My backups", backup
      types, and the Filters and More labels of every list page (`44d5a60e5`). Not recorded as seen
      rendered (inferred from the commit, which names only the tab bar sizes as seen).

### State words and ten small fixes (`6db767de3`, on main, not built, unit-tested only)

- [~] Entity state words, attribute names and weather weekday names follow the language mode,
      through one wrapper on the lookup and a table of 463 entries checked against the server's
      word lists ([`entity-words-and-stacked-labels.md`](docs/features/language-and-voice/entity-words-and-stacked-labels.md)).
      English mode unchanged; 5,000 states took 2.3 ms in English and 3.2 ms in Cantonese. State
      words were seen in Cantonese and both modes, and English unchanged, in a browser (`71824ce14`)
      and on the integration build of 18 November; attribute names and weekdays not recorded as
      seen; about a hundred attribute names still English. Not in a released build yet.
- [ ] The History tab of an entity sheet no longer jumps a second time when its content arrives.
- [ ] Fan speed buttons and sensor range chips stack the two languages on one row.
- [x] The Updates page keeps one "What's new" button, not two. Seen on the integration build of 18
      November, with the build list reachable and with every request off the host blocked
      (`71824ce14` had found the button missing entirely and restored exactly one).
- [ ] Settings home shows a count in the top bar search. Not identified in the integration look of
      18 November.
- [x] A list search no longer finds "midnight" for "light": the typo-forgiving match waits for
      words of six letters or more. Seen on the integration build of 18 November: "light" on
      Entities gave 15 rows, each containing the word.
- [ ] Developer tools remember the search per tab.
- [ ] Small buttons get a 44 px hit area.
- [ ] Backup counts read properly in Cantonese.
- [ ] The defender log words its actions as readable phrases.

### Release and process

- [~] Build 525 was published on 19 November for `44d5a60e5`. Its normal release was read back
      with 29 attachments. The isolated check and move to the hosted instance for this exact
      build are unverified.
- [x] A build containing `6db767de3` completed a browser pass in all three language modes.
      On wheel `49ed6a6b8729`, English, Cantonese and bilingual each passed 82 navigations
      to 80 distinct destinations. The three documented redirects rendered the expected
      components. All 246 page responses were HTTP 200, all 306 checked scripts matched the
      tested wheel and there were zero uncaught page exceptions. The fixture returned to English.
- The stray one-off helper script `frontend/fix-tmp.cjs` was removed from the repository in
  `44d5a60e5` (a repository change with nothing to see running, so it carries no box).
- [ ] Cantonese from these three commits read by a native reader. Not done.

## Camera events, search from the top bar, defenders and the real run of build 523, 18 November 2026

Build 2026.11.1.523 (built from `02dd3f9b4`) is what the hosted instance runs. It was verified by a
page-load pass (0 page errors in four modes) and by a real update run on a throwaway full hosting
copy before it went live. Commits `92fb942bc`, `28cd39810` and `c9e3a5e67` are on main after it and are
in no released build. A release for main was dispatched and is not yet verified or live. Feature
documentation: [`top-bar-search.md`](docs/features/interface/top-bar-search.md),
[`event-clips-and-live-recording.md`](docs/features/camera-recording/event-clips-and-live-recording.md),
[`guard-descriptions-and-reasons.md`](docs/features/defenders/guard-descriptions-and-reasons.md),
[`event-type-picker-and-zone-map.md`](docs/features/automations/event-type-picker-and-zone-map.md).
Designs: canvas 38 (the Events board) and canvas 40 (search from the top bar).

### Seen working in a real run of 523

- [x] The hosted instance runs build 523, verified by a page-load pass and a real update run on a
      throwaway full hosting copy first.
- [x] Supervisor and Core updates run from their rows. The run also showed a Core update refused
      until the Supervisor is updated (see Updates below).
- [x] Heat Defender switches a cooling unit to heat when the room is below her floor (found by a
      whole-day test, then seen in a real run; a test unit, not a real heater).
- [x] The courtesy wait setting (0 to 30 minutes, default 10) is obeyed: at zero the heating goes
      off within two seconds.
- [x] The top bar search on Personal settings.
- [x] The per-app backup row on the Updates page ("Apps: choose which apps get a backup first").

### Cameras

- [~] Each camera event has its own record and Play appears only when a clip is on disk; a missing
      clip says why in one line; a failure is logged once with a reason code
      ([`event-clips-and-live-recording.md`](docs/features/camera-recording/event-clips-and-live-recording.md)).
      Tested with a pretend camera; not seen in a browser; never run on a real camera.
- [~] Live video recorded around each event for a camera that streams only through its service:
      about 40 seconds, a one-time loopback handshake address, one live session per camera, 12 clips
      an hour. Proven end to end in a container against a pretend camera service (10.3 seconds from
      event to a saved 10.00 second clip, the temporary stream removed, no handshake text in the
      log). Not proven on a real camera.
- [ ] Clips the camera service already keeps are copied in through the integration that holds the
      sign-in; the first clip to arrive wins. Tested with a pretend camera only.
- [ ] An offline camera says when it was last seen. Written; not seen.
- [ ] Light recording has a picker for what counts as "something was seen". Written; not seen.
- [x] The camera recording page follows the language mode. Seen in both-language mode at 390 px on
      the integration build of 18 November, after two more fixes there (sliders over their labels,
      a reason said twice). Not in a released build yet.

### Search from the top bar

- [~] The search of a page lives in the top bar on about thirty pages
      ([`top-bar-search.md`](docs/features/interface/top-bar-search.md)). Most pages were looked at in
      a browser at phone width; the pages moved in `92fb942bc` and `28cd39810` are in build 524
      (inferred from its source commit), but the 524 run does not record them page by page.
- [x] The developer tools tabs sit on the standard page shell with a small event route. The commit
      calls it the riskiest edit; every moved page was looked at in a browser before `c9e3a5e67`,
      and the tabs were seen working in a real run of build 524.
- [ ] Stepping with Enter read back, and the apps pages with a Supervisor. Not seen.
- [x] Release notes search marks the words it finds and steps through them. Seen working in a real
      run of build 524.
- [ ] The count, "no matches" and "found in" in Cantonese mode, and the wrapping "found in" line.
      On main; not seen rendered after the change.
- [ ] Pages that still keep their own search field in the content (dialogs, pickers, filter panes,
      editors and similar, inferred). No list of them exists in the records; not audited.

### Updates and backups (faults of 523, fixed in `c9e3a5e67`, which build 524 contains)

- [x] The automatic updates card rests as one summary row. The isolated Updates screen showed
      the collapsed card with its Off state, category counts and one expand control. The next
      visible action was Update everything. The 1440 px light-theme review and the independent
      browser's accessibility record both confirmed this state.
- [ ] A page opened in the middle of an update reads the job list, finds the real start time and no
      longer says the backup was skipped by the reader's choice. Not proven on 524; a verification
      of build 525 is running.
- [ ] The Core row says "Update the Supervisor first" instead of trying and being refused. Not
      proven on 524; being verified on 525.
- [x] The release link in the Core update sheet uses the offered build. The 22 November check
      on stock 547 read the actual link to 548. This is the same observation recorded above.
- [x] "Custom" on the backup choice stays selected (and no longer does nothing without a Supervisor).
      Seen in a real run of 524.
- [x] The backup self-check card refreshes by itself when a new backup is checked. Seen in a real
      run of 524.

### Entity sheets

- [ ] A sheet is as tall as its content, switches use the compact 56 px switch, and the sheets
      speak Cantonese for this project's wording, tabs and headings
      ([`entity-sheets.md`](docs/features/interface/entity-sheets.md)). Unit-tested; the first browser
      look found and fixed a blank Run button and a sheet that shrank off the Details tab.
- [ ] The sheet height glides between tabs instead of jumping. In build 524; not recorded as seen
      in its run. The History tab's second jump is fixed in `6db767de3` (not built).

### Defenders

- [ ] Each of the 51 guards has a one-line description and the reason line is worded in English and
      Cantonese from a code ([`guard-descriptions-and-reasons.md`](docs/features/defenders/guard-descriptions-and-reasons.md)).
      Tested; the rendered result was not recorded as seen.
- [ ] The shared log no longer says a defender stopped when it was not running (found by the
      whole-day test). Tested; not seen.
- [ ] Cantonese for guard names and logged actions. Written by hand; not reviewed by a native reader.

### Automation editor

- [~] Event type is a searchable picker; timer triggers write their duration properly; threshold
      triggers pick a real unit and a power threshold no longer defaults to milliwatts; the first
      field of the bottom sheet can be tapped; new-style triggers are no longer "Unknown trigger" in
      the list ([`event-type-picker-and-zone-map.md`](docs/features/automations/event-type-picker-and-zone-map.md)).
      Tests, including one that reads the server's own trigger and condition descriptions; the tap and
      threshold problems were found in browser looks. Saving each kind through the editor was not
      seen.
- [ ] Zone triggers and conditions show a small map. Not seen.

### What only the owner can prove

- [ ] A real doorbell camera: whether its service accepts the handshake and what its request
      allowance permits; light recording and event clips from a real event.
- [ ] A real air conditioner and a real heater, USB sticks, provider sign-in round trips and cloud
      host sign-in.

## Editors, updates, backups, cameras, entity sheets and defenders, 17 and 18 November 2026

Everything below was on main after build 521. Build 523 (the hosted build since 18 November) contains
most of it; the section above records what a real run of 523 showed. A release for the latest main
was dispatched and is not yet verified or live. Feature documentation:
[`docs/features/updates/`](docs/features/updates/README.md),
[`docs/features/defenders/`](docs/features/defenders/README.md) and the files linked per item.

### Editors

- [~] Tailored editors for every integration action, trigger, condition and device automation
      ([`integration-editors.md`](docs/features/automations/integration-editors.md)). Registered,
      with one test over all 1,576 integration folders and a sample of ten actions seen in a local
      build in English and Cantonese. Not seen: device automation fields, the hex colour on a real
      printer action, the name and value editor writing values.
- [ ] Bambu Lab printer editors beyond the first 15 actions: tray tiles with a colour swatch, a
      colour picker for the printer's text colour format, and a file picker for the job. Not built.
- [ ] Setup forms with rich controls for about 1,000 integrations
      ([`setup-form-controls.md`](docs/features/setup/setup-form-controls.md)). Written and
      tested; not walked form by form in a browser.
- [ ] Time pattern, time offset and geolocation trigger editors. Written and tested; not seen in
      a browser.
- [ ] Autosaved drafts, draft recovery and history
      ([`drafts-import-export.md`](docs/features/automations/drafts-import-export.md)). Written
      and tested, including a byte-identical live files test; a crash was never simulated and
      nothing was seen in a browser.
- [ ] Export and import for automations, scripts and scenes, with a preview. Written and tested;
      not seen in a browser.
- [x] Editor menus as bottom sheets below 600 px, clicked at 390 and 360 px on the first, middle
      and last step (real run of build 519, fix in `28e6e9e7d`).
- [ ] Menus checked for the scenes menu at 360 px. Not seen.

### Updates

- [~] Real stages, numbers and live output on every update row
      ([`progress-and-queue.md`](docs/features/updates/progress-and-queue.md)). A running update
      with progress and output was seen in a local build, and Supervisor and Core updates ran from
      their rows in a real run of 523, and Core updated from its row twice (2:08 and 1:52) in a real
      run of 524. The 523 run found a missing start time on a second page opened mid-update (fixed in
      `c9e3a5e67`, in build 524, not proven there; being verified on 525). System update output was
      not recorded as seen.
- [x] "Update everything" shows the whole run's time. On 22 November the published 548 frontend
      displayed 2:24 for a real three-step run lasting 144.759 seconds. The Core step took
      132.743 seconds. Both browsers displayed the finished summary.
- [x] Update rows 66 px tall instead of 145 px at 390 px (measured in a local build with template
      entities).
- [~] "Update coming soon" card ([`update-coming-soon.md`](docs/features/updates/update-coming-soon.md)).
      Seen in a local build with a mocked response; not against a real build in progress. The build
      card kept showing progress after its build was installed (a fault of 523); it goes quiet in
      `c9e3a5e67`, and the quiet card was seen in a real run of 524.
- [~] Choose which updates get a backup first, down to single apps
      ([`backup-before-updating.md`](docs/features/updates/backup-before-updating.md)). Server part
      128 tests, frontend 398 tests. The per-app row was seen in a real run of 523, and Custom
      staying selected (a fault of 523) was seen in a real run of 524. Not seen: a real update that
      makes a backup of a chosen app.
- [~] Notes on a system update and "What's new in build N" open the updates log page.
      The 22 November test observed Core's offer link to 548, the installed-build button to 547
      and the completed-update link to 548. Supervisor and operating-system offers still need
      their own browser checks. See [version links](docs/features/updates/whats-new-and-notes.md).
- [ ] Automatic system update switches save (the `systemPart` fix). Not seen saving on a real
      build.
- [ ] An automatic system update watched happening inside its window. Never seen.
- [ ] "What's new" links on the Supervisor and operating system rows. Not done.

### Backups

- [~] Backup progress ([`backup-progress.md`](docs/features/backups/backup-progress.md)): a real
      local backup with its stage list was seen; per-place upload rows were not seen with a real
      cloud place.
- [~] Backup self-check with Light, Full and Off modes
      ([`backup-self-check.md`](docs/features/backups/backup-self-check.md)). Written and tested;
      a backup over 1 GiB passed the check 4 of 4 in a real run of 523. The Backups page results and
      setting were built with a mocked backup; the Off and Full modes were not recorded as run
      against a real server. The page's check card stayed stale until a reload (a fault of 523); in a
      real run of 524 a backup passed 4 of 4 and the card refreshed without a reload.
- [x] Backup self-check treats this system's own copy as local in full hosting mode (`c373e6a4c`):
      proven on a throwaway full-hosting copy, a fresh backup reads "passed" and "verified in
      full". Proof is the service's own answers, not a browser. The hosted 521 had the
      "0 of 4" fault; build 523 has the fix, and a backup over 1 GiB passing 4 of 4 was seen in a
      real run.
- [ ] Self-check against a real network mount and a real cloud place. Never run.

### Cameras

- [ ] One shared live view per camera and the calm "limited" state with backoff
      ([`live-sharing-and-light-recording.md`](docs/features/camera-recording/live-sharing-and-light-recording.md)).
      46 server tests and 27 browser tests; not seen in a browser and not proven against a real
      provider camera.
- [~] Light recording and event clips for provider-only cameras. Tests, and live recording around
      an event proven end to end in a container against a pretend camera service (see the
      section above); not proven against a real camera.
- [ ] Round-the-clock recording for provider-only cameras. Not built, on purpose: the only route
      would hand the provider's sign-in secrets to another program.

### Entity sheets and the phone

- [x] Every entity kind put on screen and used with a real pointer at phone size, eight faults
      fixed ([`entity-sheets.md`](docs/features/interface/entity-sheets.md), `80af39d52`).
- [~] Entity sheets, third pass: checked in a real browser at 390 px, 118 of 119 tiles open the
      right sheet, 33 actions hold after reopen. Not run: the light theme and wide windows, tile
      tap actions, the remaining actions' save and reopen.
- [ ] Slide to unlock for locks, wide bars for lights and covers, level tiles, a map for trackers
      and zones. Written and covered by a test; the third pass checked sheets open, but the lock
      slide and the maps were not individually recorded as seen.
- [x] One bottom bar and nothing wider than the screen at 390 and 360 px, light and dark, on eight
      pages ([`phone-compact-pass.md`](docs/features/interface/phone-compact-pass.md)).
- [ ] Touch targets of at least 44 px everywhere. Sheet buttons were addressed; the both-language
      tab bar and related list rows reach 44 px (`44d5a60e5`, seen in a browser at 390 and 320 px);
      small buttons get a 44 px hit area in `6db767de3` (not built). Others not measured.
- [~] Scrolling on long lists at 390 px: style cost halved and main-thread cost down 26% on
      Entities and 16% on Automations, but about 16% of frames are still slow. Not measured:
      Devices, dashboards, the Logbook, touch gestures, a real phone.

### AC Defender and Heat Defender

- [~] AC Defender integration ([`ac-defender.md`](docs/features/defenders/ac-defender.md)): first
      run in a real instance showed setup pickers, sliders, pause across a restart and the page; a
      pause surviving a restart was seen again in a real run of 523. Never run on a real air
      conditioner.
- [~] Heat Defender integration with its floor
      ([`heat-defender.md`](docs/features/defenders/heat-defender.md)): engine tests cover the
      floor; first run in a real instance; in a real run of 523 it switched a cooling unit to heat
      below her floor and its courtesy wait worked at zero. Never run on a real heater.
- [~] Shared band, handovers and one log
      ([`shared-band-and-handovers.md`](docs/features/defenders/shared-band-and-handovers.md)):
      the quarrel was found and fixed in a real instance. Not seen with real devices.
- [x] State kept across a restart, and a test for each number taken from the reference program
      (three watched failing with the old values). Pause after a restart was seen saved in the
      real instance run.
- [ ] Bronze on the quality scale. Not reached.

### Release and process

- [x] The release build merges this repository's English wording into every integration's text
      ([build wording](docs/features/hosting/release-build-wording.md)). The translation step
      passed on both release architectures for build 548. The published x86-64 image contained
      all 63,984 required English strings in 1,161 integrations, with zero missing or changed
      strings. The check used the exact source revision recorded on that image.
- [~] Every commit carries a skip marker and one build is dispatched per batch (the working rule).
      Most commits from `0e32f6ee9` onward carry the marker; `900ceccca`, `28e6e9e7d` and the
      earlier commits in the range (for example `a7f6196c6`) do not, because they asked for builds.
- [x] Build 524 was published for `c9e3a5e67`. The 18 November handoff records its page-load
      check, real isolated update and move to the hosted instance. The 22 November readback
      confirmed [the normal release](https://github.com/Ding-Ding-Projects/home-assistant-material/releases/tag/v2026.11.1.524)
      and its 29 attachments. The earlier build 523 release points to `02dd3f9b4`. The current
      installed build is recorded at the top of this file.
- [ ] Cantonese strings reviewed by a native reader. Not done.

### Deliberately not doing

- Cancelling a running backup or update from the interface: the server has no cancel command, so
  the button says so instead of pretending.
- Per-layer download progress, update download speed, per-integration update logs and backup
  archive-building numbers: the server does not report them, so they are not shown.
- Round-the-clock recording of provider-only cameras (see above).

## Cameras, 15 November 2026

- [~] Camera recording around the clock with guided setup (`design/canvases/32-modern-cameras`,
      boards RecWhere, RecTest, RecTestFail, RecKeep, RecStatus). Folder recording, the guided
      setup, the failed-test message and the status page were seen in a local build recording a
      test stream. Not yet seen: a real Windows share, an SSH server with SFTP or SCP, a USB disk,
      a real camera, and the published image.
- [~] Event timeline under the camera player (boards CamLive, CamPlayback, CamLiveDark,
      CamNoRecording, CamPhone). Seen in a local build at 1440 and 390 px and in the dark theme:
      events, zooms, filters, keyboard jumps, playback, speed and back to live. Not yet seen with a
      real camera's detection entities or in the published image.

## Everyday workflow follow-up, 15 November 2026

- [x] History comparison. The isolated 548 installation recorded 3, 11, 19 and 24 W in one
      nine-second window, then 24, 62, 78 and 85 W in the next. Previous equal window aligned
      the earlier trace by nine seconds and drew it dashed at 55% opacity. The day and week
      choices showed the actual empty state for the new helper. Returning to Off removed the
      comparison. The current series kept identical values and timestamps through all five
      states. Populated day-old and week-old examples were unavailable.
- [x] History chart request ownership: ignore stale statistics, subscriptions and comparison responses after reconfiguration or disconnect. Focused final tests pass; deliberate stale-response negative checks fail on the old implementation and pass after exact restoration.
- [ ] Script mode controls remain reachable while scrolling; persistent condition results wrap below the summary. Published build 441 has zero measured summary/result overlaps in 60 script views. Native display-scale, keyboard and full condition-state evidence remain pending.
- [x] Apply the accepted candidate through the supported normal updater, as authorized on 15 November. Core 2026.11.1.441, exact image/source and healthy Supervisor verified at 05:25 UTC. This does not claim an in-interface button click.
- [x] Independently exercise the update button, its progress view and recovery state. On the
      published 548 frontend a second browser watched the backed-up upgrade from 547 to 548 and
      displayed the finished summary without sending an install call. In a separate run, closing
      the initiating browser left one step. The observer offered it by name after 322.99 seconds
      and the normal recovery action completed it.
- [~] Final workflow pass. Guided setup Save and close/reload/Resume and account language/theme
      persistence passed on isolated 441. Backup extraction verified 344/344 files and three
      histories. Populated History comparison passed on the isolated 548 installation. A booted
      restored instance and broader keyboard and native display-scale acceptance remain pending.

## Backup hosting follow-up, 15 November 2026

- [ ] Host a selected backup as a separate web application or appliance from the Backups interface. The rebuilt dialog passes 24 actual action/width/language combinations. Pairing and selected-backup transfer remain unverified; new runtime not yet delivered.
- [ ] Desktop **Host a backup** accepts an uploaded native archive or ZIP and offers Docker, SSH, VirtualBox, VMware and Raspberry Pi. Native 1.6.0 packages through the root entrypoint; real ZIP import and one owned Docker provisioning job are verified. Upload/restore and non-Docker runtime acceptance remain incomplete.
- [ ] Automatically restore after first-use setup, preserving original automation activity. Return a checked destination link only with truthful readiness or incomplete sign-in status.
- [ ] Publish the immutable offline preparation helper and bind its digest into the native build. Pinned local helper builds; six synthetic partition checks and four JavaScript bootstrap checks pass.
- [ ] Deliver matching Core and Supervisor backup-authority exclusions before enabling the new pairing workflow on the existing installation.
- [ ] Complete the single retained synthetic restore without duplicating its job or instance. Same-job resume and cold-start waiting are verified; the first upload received an unrecorded non-2xx response. A diagnostic candidate retains bounded status/stage and requires an idle receiver. No restore POST has been submitted.
- [ ] Refresh current public evidence from accepted captures. Native private footer paths are withheld; browser strict one-entry promotion remains incomplete despite genuine private runtime evidence.

## Foundation

- [x] Vendor the upstream sources at pinned releases
- [x] ~~Release workflow: one tagged release per push.~~ Historical policy replaced by explicit scoped publication on 15 November 2026. Source pushes retain build outputs; a source build is not a release.
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
- [x] Observe a Core update from one build to the next through Settings. On 22 November the
      backed-up test installation upgraded from 547 to 548 through Update everything. The two
      browsers used the published 548 frontend throughout. On a second 548 installation the
      recovery card offered the one remaining update by name and completed it.
- [x] Add the operating system signing secrets (set 10 November 2026)
- [ ] Observe an over-the-air operating system update between two builds signed with them. No
      operating system image has been booted with an over-the-air update
- [ ] Run `build.bat --run` and `build-installer.bat` on Windows
- [ ] Run `deploy-assistant\build.bat` on Windows. Run once on 12 November: install, 21 tests
      and the window build passed; the installer step made nothing on Node.js 26 (the script
      now says so straight after the install). Run again the same day with a portable
      Node.js 22: exit 0 and the installer was made. Installing it is not verified

## Hosting

- [ ] Build and boot the release-pinned Raspberry Pi 3, 4, and 5 appliance images with
      Core preloaded. Source and mocked platform selection are in the recovery branch.
      Verify the actual packaged size, unattended service startup, and normal owner setup.
- [x] `compose.yaml` that runs the published image, with the port and storage mapped
- [~] `host.sh` and `host.bat`: pull, start, wait for health, print the address; a detached mode
      and a live log view. `host.sh` was run for real on Linux; `host.bat --detached` was run on
      Windows 11 with build 46. The interactive log view on Windows has not been run
- [x] The [public dashboard demo](https://ding-ding-projects.github.io/home-assistant-material/demo/#/lovelace/home)
      runs under the project's subpath. On 22 November, the published build from `fc5d13aa`
      loaded 90 project scripts at both 360 and 1440 px. At both widths the keyboard toggled
      the sample floor lamp from 70% to off and back to 70% and opened and dismissed the dashboard
      menu. Neither browser reported an uncaught exception.
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

- [ ] Show measured backup upload progress and actual restore phases in onboarding and
      Settings. The transport and restore event audit is complete. Implementation and
      synthetic upload, interruption, and restart verification are pending.
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
      at 1440, 390 and 320 px. Cantonese for other pages is not written, except entity sheets,
      Backups, the camera timeline, relative times and entity state words (see the section of 18
      November 2026 at the top)
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
- [ ] Verify the Number action range, compatible date fields, and Yamaha cursor picker
      in a built candidate.
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
- [x] All four web app manifest shortcuts opened from the running 548 installation in a
      360 px browser. Overview opened the home overview, History showed its source picker,
      Energy opened step one of setup, and Settings opened its dashboard. The manifest and
      all four destinations returned HTTP 200 with zero uncaught page errors. Native phone
      launcher behavior was outside this browser check.
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

- [ ] Verify the packaged Raspberry Pi writer and readiness flow. Source and simulated
      checks preserve the verified write and allow read-only network retries. A physical
      card, the installed desktop package, and a rendered walkthrough are still pending.
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
