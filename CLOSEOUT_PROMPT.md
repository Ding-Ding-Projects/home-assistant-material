# Continuation handoff

Updated 25 November 2026, when work paused. The longer record is in
[HANDOFF.md](HANDOFF.md#closeout-25-november-2026), and the open rows are in [ROADMAP.md](ROADMAP.md).

## Objective

Home Assistant Material keeps today's look with a modern Material 3 polish. The current work has
three parts: repair scrolling and cut-off text on phone-sized screens, following design canvases
46 and 47 in `design/canvases/`; fix the card editor whose Config tab shows no form; and keep the
marketplace, printer discovery and filter menus working. Nothing is removed. Dashboard cards stay
as they are.

## State on the remote

- `main` is at `50b086e5c`. It includes:
  - the canvas 46 and 47 fixes;
  - the build 564 check fixes (`e28dd990e`);
  - the shared filter chip menu, with search and a pattern workbench in every chip menu;
  - the marketplace rename (`f42a95165`).
- Release run 45675736303 is building `50b086e5c`. It was unverified when work paused.
- The owner's instance was not changed in this closeout.
- The card editor fix sits on branch `worktree-wf_d6ee1ac0-504-1` and is not merged:
  - `8efac94bd` is a complete first attempt;
  - `3eafb6dcd` is a review follow-up stopped partway, which touches the shared dialog components.

  Neither has been verified in a browser. The branch also carries two probe files under
  `frontend/test/panels/lovelace/editor/scratch/`; delete them before merging.
- The full marketplace suite passed on the current core tree: 1283 passed, 55 snapshots, 4 warnings.
- Two design items are partly done: the docked media player bar look, and the edit-mode menu
  buttons for badges and cards.

## How a build reaches the owner's instance

1. Commit with `[skip ci]`, push, then start one build: `gh workflow run release.yml --ref main`.
   A new run cancels a waiting one, so start it once.
2. When the image is published, check that exact build on a throwaway copy in a browser at
   phone width and at desktop width, including a click-through of each item the build claims to
   repair.
3. Only on a pass, update the owner's instance, Supervisor first, with a backup. Read back the
   versions and the health state, then report the build and the time in 24-hour form.

## Next steps

1. Card editor:
   - Reproduce the empty Config tab at 390 × 844 on a throwaway copy, and record what the page
     renders before changing code.
   - Choose between the two approaches on the branch and fix it.
   - Verify in a browser, then merge into `main`.
2. Check the next published build (step 2 above) for:
   - the canvas 46 and 47 items;
   - filter menus not jumping while you type;
   - the pattern workbench footer;
   - the add-integration list and its fallback brand icon;
   - dropping a `.hapkg` file;
   - the printer discovery strings.
3. Finish the two partial design items, then tick roadmap rows only with recorded evidence.

## Rules that must hold

- No confirmation is weakened: the two keys and the slider stay.
- A browser that only watches an update never starts one.
- Going back to an older build makes a backup first.
- No data leaves the home except what the owner turned on.
- Every search field keeps its pattern workbench.
- Times are 24-hour, and layouts are sized for a 390 px phone first.
- No private wording, machine path, serial, access code or address goes in any file here.
