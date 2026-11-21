# Continuation handoff

Written 20 November 2026, 23:45 Toronto time. This replaces the earlier copy. `HANDOFF.md` has the long record; its newest section is "State at the stop on 20 November 2026".

## Objective

Home Assistant Material: keep today's look with a modern polish, repair scrolling and cut-off text, add controls in place, a run-once quick action and "show more details", and keep the public site current. Nothing is removed. Dramatic motion is for actions only. Dashboard cards stay as they are.

## Where the source is

Everything is on `main`. There is no other branch, linked working tree or stash in this repository.

## What is running where

- The owner's instance runs build 2026.11.2.536 (Core) and 2026.11.0.536 (Supervisor). It was moved there on 20 November 2026 at 10:16 Toronto time after a browser check.
- Build 537 (Updates page fails soft after a restart) and build 538 (polish pass) are published. Neither has been checked in a browser.
- A release run was queued for the source that holds the hunt repairs and the three new features. Whether it finished is not known; check the release list.
- The last commit of this session carries `[skip ci]`. It has not been built. Start a build with `gh workflow run release.yml --ref main`.

## Built in source, never seen in a browser

1. Polish pass: one scroller on list pages, a measured end space, wrapping names, dialogs and sheets with fixed title and buttons, floating tool pills, search on more pages and filter panels, action moments.
2. Fourteen repairs from the browser hunt on build 536, including the blank area pages and the page titles that stacked one letter per line.
3. Controls in place on listed entities, "Run a quick action", "Show more details".
4. Second pass: an expandable detail row in the shared data table, details and quick buttons in more lists, the states tool opening on one entity.
5. A stop control for a running quick action, with a small server component `quick_action`.

## Not verified, said plainly

- Nothing after build 536 has been seen in a browser.
- Python tests were run once the container engine came back: `quick_action` 12 passed; the `default_config` start-up test passes with `quick_action` loaded, and its teardown reports a missing translation (`services.wake.name`) in the older `wall_tablet` component. That last fault is not from this work and is open.
- The operating system update step cannot be exercised in a container copy.
- The public site was looked at from local files at 320, 390 and 1440 px. It was not checked on its published address after the last change, and its hero picture is still the old one. The files a capture pass must provide are `docs/site/img/hero-light.webp` and `docs/site/img/hero-dark.webp`.

## Checks at the stop

- Frontend: 9889 tests pass, with the 3 long-standing failures in `test/build-scripts/build-management.test.js`. Type check at its 2 long-standing gallery errors.
- Wording scan of every added line: clean.

## Next safe steps, in order

1. The `wall_tablet` translation message in the `default_config` test is not a source fault: `strings.json` has the string, and the generated `translations/en.json` is ignored by design and was simply absent in the test copy. Generate it in the test container (`python3 -m script.translations develop --integration wall_tablet`) before running that test folder.
2. Start a release build and wait for its image.
3. Browser check of that build on a throwaway copy: the 80-page pass, each of the fourteen hunt findings, the quick controls (a lock must ask first), a quick action with a wait that is then stopped, the detail row in tables, and a comparison with pictures of build 536 so the look has not drifted.
4. Only on a pass, move the owner's instance, Supervisor first, and read back versions and that Supervisor self-update is off.
5. Write the notes for each new build in the updates log repository.

## Known open items

- History page and the states tool's own rows have no quick buttons. Tags cards view and area cards have no details expander.
- The empty space beside automation names at 320 px is only partly recovered.
- Design canvas 42 records the owner's decisions; its boards are in `design/canvases/42-modern-polish-2`.

## Rules that must hold

No confirmation is weakened: the two keys and the slider stay. Nothing installs by itself. Going back to an older build makes a backup first. No data leaves the home except what the owner turned on. No private wording, machine path or address in any file here.
