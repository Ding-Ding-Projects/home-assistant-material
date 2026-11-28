# Continuation handoff

## Active issue sweep, 27 November 2026

Continue the 12 open issues and six handoff items on `main` in the primary checkout. The verified baseline is `ddc8aea3f78d5658563509616bdf5535155e5759`. The current edits and their remaining checks are summarized at the top of `HANDOFF.md`. Use one assigned worker per item, keep overlapping writes serialized, and preserve the existing edits. Published checks for the camera list and timeline, printer cards, and phone card editor used synthetic fixtures.

The account boundary stopped new work before an integrated build, the final publication scan, release and issue closures. Reverify the remote tip, finish and verify the candidate on isolated targets, then push `main` and check the exact remote SHA. Close each issue only once its resolution is verified. Complete the goal after all 12 closures and all six handoff items have verified results.

Updated 27 November 2026. The five features and both follow-ups reached main at `1fe47b5db`. Chromium component checks and the remaining published-build acceptance steps are recorded in [the roadmap](ROADMAP.md). The branch list below describes the original pause on 25 November. Longer record: [HANDOFF.md](HANDOFF.md).

## Objective

Finish, verify and ship five pieces of work, each drawn first on a design canvas in `design/canvases/`:

1. Camera recording page: one folding row per camera with a search field (canvas 48), plus dragging the camera timeline
   across the whole day with a readout bubble (canvas 48, Timeline page).
2. 3D printer status card and control card for dashboards (canvas 49).
3. Camera recording logging: every reason a camera does not record goes to the log; recorder honours stream options,
   has a socket timeout and a no-data watchdog; diagnostics download. Reported case: a 3D printer RTSPS camera that
   streams live but never records.
4. SSH access page with key-only SSH on the operating system and in the Docker full mode (canvas 50).
5. Restore a backup while the first start is preparing, then continue unattended (canvas 51).

## State on the remote

- `main` has the four canvases (`f730eb76d`) and this handoff. No feature code is on `main` yet.
- Branch `ai/integration/20261125-five-lanes` (`614cdcf64`) merges pieces 1 (rows and timeline), 2 and 3. Frontend type
  check passes; full frontend suite: everything passes except one dialog test that also fails on `main`, and one build
  script test that is a timing flake under full-suite load (passes alone).
- Branch `worktree-wf_302090df-21c-1` (`773a2e7ee`): piece 4. Supervisor 512 tests pass, frontend 34 tests pass.
- Branch `worktree-wf_302090df-21c-2` (`75b39c42a`): piece 5. Supervisor and landing page tests pass.
- Two follow-ups were still running when work paused, in local worktrees only: the Core onboarding route for the
  queued restore (piece 5 cannot show progress after the landing page is gone without it) and the SSH port for
  instances made by the deploy assistant (piece 4). Their worktrees are under `.claude/worktrees/wf_b3654b0e-8d3-*`.
- The older card editor branch `worktree-wf_d6ee1ac0-504-1` (`3eafb6dcd`) is unchanged and unmerged.
- Nothing has been built or seen in a browser. The owner's instance was not changed.

## Next steps

1. Finish or redo the two follow-ups; merge pieces 4 and 5 (with follow-ups) into the integration branch; resolve
   translation file conflicts; run the frontend type check and suites.
2. Merge into `main` with `[skip ci]`, start one build (`gh workflow run release.yml --ref main`).
3. Check the published build on throwaway copies: demo cameras with camera recording for pieces 1 and 3; a fresh full
   mode copy for pieces 4 and 5 (SSH login with a pasted key; upload a backup while preparing and walk away).
   Pieces 2 need a mocked printer (gallery or test hass) since no printer is reachable.
4. Only on a pass, update the owner's instance.

## Rules that must hold

- Keys only for SSH, private keys refused, port 22222 kept inside the home network.
- No confirmation is weakened; Stop on the printer asks first.
- Every search field keeps its pattern workbench. Times are 24-hour; layouts sized for a 390 px phone first.
- No private wording, machine path, serial, access code or real address in any file here.
