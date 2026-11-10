# Handoff

Written 9 November 2026 for whoever picks this up next.

## Where things stand

- `main` holds the vendored upstream sources, the release workflow, the update feed tooling, the
  build scripts, and the complete design (153 boards on 11 canvases, `design/`).
- Build 1 (`v2026.11.1.1`) built and published the frontend wheel, every container image and the
  update feed. Its operating system jobs were still running when this was written. Check the
  release notes of the newest release that rebuilt the product for the final job results.
- The interface work has started in `frontend/`: colour scales and surfaces, the typeface, the
  navigation rail, the floating pane, pill tabs, the build stamp on the rail, and the bar of open
  pages with its New tab catalog. `docs/feature-status.md` says exactly what is built and what has
  only been seen in the frontend's demo build. Everything else on the canvas is still a design.
- Open work is tracked in issues 1 to 11 of this repository.

## Next steps, in order

1. Confirm the operating system images attached to the release, then boot the VirtualBox image
   (`haos_ova-<version>.vdi.zip`) and a Raspberry Pi image. Record what happens in
   `docs/feature-status.md`.
2. Continue the interface work in `frontend/` (issue 4 first): the search field and accessibility
   button in the header, the redesigned Home, the phone layout, then the feature groups in issues
   5 to 10. The boards to match are in `design/canvases/`; `design/frames/` shows how each should
   look. To see changes locally, run `npx gulp develop-demo` in `frontend/` and open port 8090.
   New translation strings and static files need a restart of that server.
3. Work down `ROADMAP.md`. List every edit to a vendored folder in `docs/material-changes.md`.

## Things that will surprise you

- Every push to `main` publishes a release. Pushes that touch only `design/`, `docs/` or Markdown
  files skip the builds.
- A build that has started always finishes. While it runs, only the newest waiting build of each
  kind is kept; older waiting ones are dropped, so some releases carry notes and no images. The
  newest push is always built. Operating system builds take hours.
- Build versions are `<upstream version>.<workflow run number>`. The committed sources keep the
  upstream numbers; `scripts/ci/set-versions.py` stamps the build number inside the runner.
- Integration translations are copied out of the upstream image for the pinned core release,
  because upstream downloads them with a private token.
- Operating system updates over the air stay off until the `RAUC_CERTIFICATE` and
  `RAUC_PRIVATE_KEY` repository secrets exist.
