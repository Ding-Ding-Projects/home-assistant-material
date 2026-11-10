# Handoff

Written 9 November 2026 for whoever picks this up next.

## Where things stand

- `main` holds the vendored upstream sources, the release workflow, the update feed tooling, the
  build scripts, and the complete design (48 boards, `design/`).
- Build 1 (`v2026.11.1.1`) built and published the frontend wheel, every container image and the
  update feed. Its operating system jobs were still running when this was written. Check the
  release notes of the newest release that rebuilt the product for the final job results.
- The product's interface is still the upstream interface. No design board is implemented.

## Next steps, in order

1. Confirm the operating system images attached to the release, then boot the VirtualBox image
   (`haos_ova-<version>.vdi.zip`) and a Raspberry Pi image. Record what happens in
   `docs/feature-status.md`.
2. Start the interface work in `frontend/`: tokens first (`src/resources/theme`), then the shell
   (`src/layouts`, `src/components/ha-sidebar.ts`, `src/panels/lovelace/hui-root.ts`). The boards
   to match are `design/canvas/Main.dc.html`, `Energy.dc.html`, `Settings.dc.html` and
   `Phone.dc.html`; `design/frames/` shows how each should look.
3. Work down `ROADMAP.md`. List every edit to a vendored folder in `docs/material-changes.md`.

## Things that will surprise you

- Every push to `main` publishes a release. Pushes that touch only `design/`, `docs/` or Markdown
  files skip the builds.
- Operating system builds take hours and are cancelled by a newer push that also rebuilds.
- Build versions are `<upstream version>.<workflow run number>`. The committed sources keep the
  upstream numbers; `scripts/ci/set-versions.py` stamps the build number inside the runner.
- Integration translations are copied out of the upstream image for the pinned core release,
  because upstream downloads them with a private token.
- Operating system updates over the air stay off until the `RAUC_CERTIFICATE` and
  `RAUC_PRIVATE_KEY` repository secrets exist.
