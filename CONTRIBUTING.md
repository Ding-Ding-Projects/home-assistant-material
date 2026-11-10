# Contributing

- Interface work goes in `frontend/`. Follow the design in `design/` and update
  `docs/feature-status.md` when a feature's state changes.
- Any edit inside a vendored folder (`core/`, `frontend/`, `supervisor/`, `operating-system/`,
  `landingpage/`, `version/`) must be listed in `docs/material-changes.md`, so it can be re-applied
  when that folder moves to a newer upstream release.
- Keep changes small and push them to `main` often. Each push publishes a release.
- Commit messages are plain English: a short subject line, then what changed and why.
- Do not commit secrets, signing keys or tokens. Operating system signing keys live only in
  repository secrets.
- Bugs in unchanged upstream code are best reported upstream; link the upstream issue here.
