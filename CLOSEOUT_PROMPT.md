# Continuation handoff

Written 21 November 2026, 11:20 Toronto time. This replaces the earlier copy. `HANDOFF.md` has the long record; its newest section is "State on 21 November 2026".

## Objective

Home Assistant Material: keep today's look with a modern polish, repair scrolling and cut-off text, add controls in place, a run-once quick action and "show more details", and keep the public site current. Nothing is removed. Dramatic motion is for actions only. Dashboard cards stay as they are.

## Where the source is

Everything is on `main`. The remote also has `channel`, the update feed that installed copies read: never merge or delete it. There is no other branch, linked working tree or stash.

## What is running where

- The owner's instance runs build 2026.11.2.547 (Core) and 2026.11.0.547 (Supervisor), moved there on 21 November 2026 at 09:50 Toronto time after build 547 passed a browser check on a test copy. Supervisor self-update is off.
- Build 548 (source 7650c522a) is published and holds the repairs for the small faults that check left. Its browser check was started on 21 November 2026 and stopped a few minutes in, at the owner's request to close the session. It produced no verdict. Build 548 has NOT been checked in a browser and must not be put on the owner's instance until it has.
- The full test copy `ham-full-queue` is stopped on Supervisor 2026.11.0.548 and Core 2026.11.2.548. The throwaway check copy was removed.

## How a build reaches the owner's instance

1. Commit with `[skip ci]`, push, then start one build: `gh workflow run release.yml --ref main`. A new run cancels a waiting one, so start it once.
2. Wait for the image, then check that exact build in a browser on throwaway copies: the 80-page pass, the items the build claims to repair, and a comparison with the build that is live.
3. Only on a pass, update the owner's instance, Supervisor first, with a backup, and read back the versions and that self-update is off.
4. Write the build's notes in the updates log repository, and check each demo really runs.

## History of the last builds

536 passed. 542 and 543 were refused (names squeezed on a phone in the Entities list; the search drop-down emptying). 544 passed. 545 and 546 were refused for Updates page faults. 547 passed.

## Known faults in build 547, repaired in the newest commit but not yet seen in a browser

- After an update that includes Core, the summary's "whole run took" time read too short in the browser that ran it.
- A stranded run with one step left offered only "Clear this run".
- On some phone rows a wrapped button sat at the left while the others sat at the right.

## Not verified, said plainly

- The operating system update step cannot be exercised in a container copy.
- "Still installing, finishes by itself" on a stranded run was never seen, because the test installs finish in seconds.
- The public site was looked at from local files, not on its published address after its last change. Its hero picture is still the old one; a capture pass must provide `docs/site/img/hero-light.webp` and `docs/site/img/hero-dark.webp`.

## Checks at this commit

- Frontend: 9970 tests pass, with the 3 long-standing failures in `test/build-scripts/build-management.test.js`. Type check at its 2 long-standing gallery errors.
- Python, run in a throwaway container with the recipe at the top of `HANDOFF.md`: `auto_update` 162 passed, `quick_action` 12 passed (at commit c2e5b0256; no Python changed since).
- Wording scan of every added line: clean.

## Open items

- History page and the states tool's own rows have no quick buttons. Tags cards view and area cards have no details expander.
- Quick buttons are not in entity pickers or dashboard cards, on purpose.
- Design canvas 42 records the owner's decisions: `design/canvases/42-modern-polish-2`.

## Rules that must hold

No confirmation is weakened: the two keys and the slider stay. Nothing installs by itself, and a browser that only watches an update never starts one. Going back to an older build makes a backup first. The update run record is display only. No data leaves the home except what the owner turned on. No private wording, machine path or address in any file here.
