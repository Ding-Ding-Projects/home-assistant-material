# Continuation handoff

Updated 27 November 2026 (branch closeout). The five features and both follow-ups are on `main`;
the last published release is build 572. This pass removed the branches whose work is already in
`main` and kept every unmerged branch with the reason it was kept. The previous tip was
`ddc8aea3f`; the tip that carries this handoff is the current `main`. Longer record:
[HANDOFF.md](HANDOFF.md). The authoritative state is [ROADMAP.md](ROADMAP.md).

## Objective

Finish, verify and ship the work drawn on the design canvases in `design/canvases/`, then update
the owner's instance only on a verified pass. The five features below reached `main` at
`1fe47b5db`:

1. Camera recording page: one folding row per camera with a search field (canvas 48), plus dragging the camera timeline
   across the whole day with a readout bubble (canvas 48, Timeline page).
2. 3D printer status card and control card for dashboards (canvas 49).
3. Camera recording logging: every reason a camera does not record goes to the log; recorder honours stream options,
   has a socket timeout and a no-data watchdog; diagnostics download.
4. SSH access page with key-only SSH on the operating system and in the Docker full mode (canvas 50).
5. Restore a backup while the first start is preparing, then continue unattended (canvas 51).

## State on the remote

- `main` is at the tip that carries this handoff. The previous release, build 572, was built from
  `30b46fad5` and published.
- This pass removes the branches whose tips were already ancestors of `main`:
  `ai/finish-20261127`, `ai/integration/20261125-five-lanes`, `ai/wip/20261125-ui-batch`,
  `worktree-wf_302090df-21c-1`, `worktree-wf_302090df-21c-2`,
  `worktree-wf_b3654b0e-8d3-1`, `worktree-wf_b3654b0e-8d3-2`. Their work is in `main`.
- Kept, with the reason:
  - `channel`: the release update feed. `release.yml` reads
    `.../channel/stable.json`, and `scripts/ci/publish-channel.sh` writes it. It has its own
    history, so it is never merged into `main`.
  - `feature/household-experience` (open PR #15): household briefings, printer discovery and Home
    activity. It conflicts with `main` in `ROADMAP.md` and the translation files, so it needs a
    rebase and review before it can land.
  - `feature/integration-atlas-about` (open PR #14): integration documentation atlas links. It
    conflicts with `main` in a config-flow test, so it needs a rebase and review before it can land.
  - `ai/prepare-restore-acceptance-571` and `ai/prepare-restore-acceptance-572`: disposable
    acceptance lanes pinned to build 572. Their workflow runs only on
    `acceptance/first-start-572`, so they are verification harnesses, not product changes.
  - `worktree-wf_d6ee1ac0-504-1`: the card editor candidate. It is unverified and its second
    commit was stopped partway. Two scratch probes under
    `frontend/test/panels/lovelace/editor/scratch/` must be removed before any merge.

## Next steps

1. Rebase and review PR #15 and PR #14, then merge each on its own with `[skip ci]`.
2. Card editor: reproduce the empty Config tab at 390 x 844 on a throwaway copy, choose one
   approach on `worktree-wf_d6ee1ac0-504-1`, remove the scratch probes, verify in a browser and
   merge.
3. Check a published build on throwaway copies for the roadmap rows that are still unticked, and
   tick a row only with that evidence.
4. Only on a pass, update the owner's instance, Supervisor first and with a backup.

## Rules that must hold

- Keys only for SSH, private keys refused, port 22222 kept inside the home network.
- No confirmation is weakened; Stop on the printer asks first.
- Every search field keeps its pattern workbench. Times are 24-hour; layouts sized for a 390 px phone first.
- No private wording, machine path, serial, access code or real address in any file here.
