# Upstream sources

Home Assistant is developed across several repositories. This repository vendors each
one into its own subfolder at a pinned release, so the whole product builds from a
single checkout.

| Subfolder | Upstream repository | Pinned release | Commit |
| --- | --- | --- | --- |
| `core/` | https://github.com/home-assistant/core | `2026.11.2` | `ff5d56b825a0fb66b03d01bc297d49e206cdaba3` |
| `frontend/` | https://github.com/home-assistant/frontend | `20261028.6` | `92bcd97390e7f684df4bf3738aec812ff427d46e` |
| `supervisor/` | https://github.com/home-assistant/supervisor | `2026.11.0` | `c1c6f0a754c0656eb1af189f11009f1cfc4b3e28` |
| `operating-system/` | https://github.com/home-assistant/operating-system | `18.5` | `fc301f556647b53281e853b9ce7f44915b3c7b14` |
| `operating-system/buildroot/` | https://github.com/home-assistant/buildroot | branch `2024.02.x-haos` | `5c344b3789e3f6d620cf11ffab60e522a875cc79` |
| `landingpage/` | https://github.com/home-assistant/landingpage | default branch | `1dc7e7e2aabb45aca8a01406b99da5905b4f5117` |
| `version/` | https://github.com/home-assistant/version | default branch | `ff76c4b3ee540f6077561b28fb33236ad18da6a5` |

Notes:

- `core/` pins `home-assistant-frontend==20261028.6`, which is why `frontend/` is vendored at that release.
- `operating-system/buildroot/` is a Git submodule upstream. Here it is vendored as plain files at the
  exact commit the `18.5` release records, and `operating-system/.gitmodules` is removed.
- Every subfolder keeps its upstream licence file. Home Assistant projects are Apache-2.0;
  Buildroot is GPL-2.0-or-later. See `NOTICE.md`.
- Workflow files inside the subfolders (`*/.github/workflows`) are kept for reference only.
  GitHub runs only the workflows in the root `.github/workflows` folder.

Checked on 9 November 2026: at the commit that vendored each subfolder, every file's Git blob
is identical to the same file in the upstream commit above. The only differences are the removed
`.gitmodules` files and the Buildroot submodule link, which is replaced by the files themselves.
That check was made against the releases pinned at the time (`core/` `2026.11.1` at
`d8a0dc698c8946b44e455d904000db563cfbf1ba`, `frontend/` `20261028.5` at
`e32bc0696ebefde323f5b791269ad0c57f3f99d9`, `landingpage/` at
`1ef7039863c87797af19cd6240fb58cb5d2ac465`, `version/` at
`e1d16116d4cad3e7c137040755b6210946eecc80`).

Moved on 19 November 2026: `core/` to `2026.11.2`, `frontend/` to `20261028.6`, and
`landingpage/` and `version/` to the head of their default branches. Each move applied the
upstream difference between the old and the new commit to the subfolder with a three-way
merge, so this project's own changes stay in place. In `frontend/`, four files needed a hand
merge: `src/components/data-table/ha-data-table.ts`,
`src/layouts/hass-tabs-subpage-data-table.ts`,
`src/panels/config/automation/ha-automation-picker.ts` and
`src/panels/config/scene/ha-scene-dashboard.ts`. `supervisor/`, `operating-system/` and
`operating-system/buildroot/` were already at the newest stable release and did not move.

To move a subfolder to a newer upstream release, replace its contents with the new release,
re-apply the changes listed in `docs/material-changes.md`, and update this table.
