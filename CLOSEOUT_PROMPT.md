# Continuation handoff

Updated 27 November 2026 (late merge and cleanup pass). Longer record: [HANDOFF.md](HANDOFF.md).
The authoritative state is [ROADMAP.md](ROADMAP.md).

## Objective

Finish, verify and ship the 12 open issues and the work drawn on the design canvases in
`design/canvases/`, then update the owner's instance only on a verified pass.

## State on the remote

- `main` contains pull requests #14 and #15 (merge tip `de762baa7`, followed by this handoff).
  The last published release is build 572, built from `30b46fad5`. Nothing newer was released.
- On the merged tree the frontend type check, 85 frontend tests and 56 backend tests passed. No
  full suite, product build, browser check or release ran.
- `ai/wip/20261127-issue-sweep` (`a3e247ab3`): unfinished, unverified edits for the issue sweep.
  Not merged. Its handoff lists what each issue still needs.
- `worktree-wf_d6ee1ac0-504-1` (`3eafb6dcd`): unverified card editor candidate, second commit
  stopped partway. Remove the scratch probes under
  `frontend/test/panels/lovelace/editor/scratch/` before any merge. A later check could not
  reproduce the empty Config tab for one tile card at 390 x 844; other cards were not checked.
- `ai/prepare-restore-acceptance-571` and `-572`: acceptance lanes pinned to build 572.
- `channel`: the release update feed. It has its own history and is never merged into `main`.

## Next steps

1. Bring `ai/wip/20261127-issue-sweep` up to date with `main`, resolve conflicts, finish each
   issue, run the focused tests, an integrated build and the publication scan, then merge.
2. Fix the two layout defects listed at the top of the roadmap.
3. Start one release build from the verified `main`, check it on throwaway copies, and tick
   roadmap rows only with that evidence.
4. Close each issue only once its resolution is verified.
5. Only on a pass, update the owner's instance, Supervisor first and with a backup.

## Rules that must hold

- Keys only for SSH, private keys refused, port 22222 kept inside the home network.
- No confirmation is weakened; Stop on the printer asks first.
- Every search field keeps its pattern workbench. Times are 24-hour; layouts sized for a 390 px phone first.
- No private wording, machine path, serial, access code or real address in any file here.
