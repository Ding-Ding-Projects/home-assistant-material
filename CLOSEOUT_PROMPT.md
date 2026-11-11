# Closeout prompt

A continuation note for whoever picks this project up next. It records state up to the commits
named below and claims nothing beyond them. The authoritative lists are `docs/feature-status.md`,
`ROADMAP.md` and `HANDOFF.md`.

## Project

home-assistant-material: a Material Design 3 build of Home Assistant (frontend in `frontend/`,
server integrations in `core/homeassistant/components/`, boards in `design/canvases/`, the Deploy
Assistant desktop app in `deploy-assistant/`). The goal is every board built and the running
product matching it.

## Current state

- `main` holds the work up to commit `fd656ab96` (batch 17 is `0d9dc73d4`; the Windows clone, build
  crash and empty-release fixes are `5b2c6af85`). Other lanes may have uncommitted changes in the
  working copy; stage files by explicit path.
- Landed in the last batch: review fixes (Minecraft over SSH, automation and dashboard history,
  Ollama, shared identity, import summary); appearance and personal wording saved on the instance;
  authenticator card, activity tray and recovery card, schedules and shared defaults, information
  buttons, split panes and a resizable filter pane, starting points; fixes for defects seen in
  build 80; a plain clone on Windows; a local build that no longer crashes on many processors;
  releases only for pushes that change the product.

## Verified, and how

- 623 server tests pass in a Linux container (passkey 143, Minecraft manager 217, Ollama suite 70,
  frontend storage 36, automation and dashboard history 157).
- Frontend type check clean; 5,093 frontend tests pass with the unchanged baseline of 3 failures
  and 46 files that do not load.
- The production frontend container build completes with the processor cap.
- A plain clone checks out on Windows 11.
- The changed server integrations load without errors in a running copy.

## Not verified

- No page or component of the last batch has been opened in a browser: authenticator card,
  activity tray and recovery card, schedules and shared defaults, information buttons, split panes
  and filter pane resize, starting points, appearance and wording saved to the instance, the import
  summary changes, and the archive list on the history pages.
- No operating system image has been built since the file rename.
- The new release workflow jobs have not run (attach the Deploy Assistant, withdraw an empty
  release, no release for documentation-only pushes).
- `deploy-assistant\build.bat` (added by another lane) has not been run; the build fix has been
  tried on one computer only.
- No real authenticator app, Docker host over SSH, Ollama server or forge remote has been used.

## Next steps

1. Run the newest image or the served frontend and look at each page listed under "Not verified";
   record what is seen in `docs/feature-status.md` and tick `ROADMAP.md` only then.
2. Watch the next product push for the Deploy Assistant attachment and the absence of a release
   for a documentation-only push; build an operating system image and confirm the two renamed
   mount units are back under their real names.
3. Prove backups carry `automation_repos/` and `dashboard_repos/` (see `HANDOFF.md`).
4. Remaining board work: the Tools code generator (needs a credential vault), schedule triggers
   from entities and web services, the guided form worked example and practise control, the update
   dialog in the activity tray, draft recovery for editors, collapsible statistics.
