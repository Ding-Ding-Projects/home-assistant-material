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

- `main` holds the work up to commit `662a8731e` (batch 18 is `8fa63f05d`, batch 19 is
  `0d056629e`; the pinned group header fix is `f86ff751a`; the dashboard tools dialog is
  `cbefeaf48`; the release workflow commits are `5b2c6af85`, `b64779d75` and `3ce9e087a`). Other
  lanes may have uncommitted changes in the working copy; stage files by explicit path.
- Commit `b64779d75` carries a message that belongs to another project. It copies the Deploy
  Assistant installers onto a release straight after the release is created and withdraws a
  release when no build job of its own attached a file. `3ce9e087a` records this; history is not
  rewritten.
- The hosted instance on the owner's network runs build 2026.11.1.96. Builds 88 and 91 were skipped
  on purpose: settings saved on the instance could cross between two accounts on one browser;
  batch 18 fixed it.
- Landed: account-safe saving of settings on the instance, update install stages and recovery card,
  the Minecraft server page, Ollama unload, details and test chat, the support page and bundle, one
  save bar in the editors, embedded page panel changes, Cantonese additions, media folder
  management and the "Add media" fix, the paid cloud service hidden in the interface (server
  integration unchanged), history search and version picker, new converter formats, and the
  dashboard tools dialog.

## Verified, and how

- Verified by running: frontend type check clean; 5,337 frontend tests pass with the unchanged
  baseline of 3 failures and 46 files that do not load; server tests in a Linux container: media
  source 109 passed, Ollama 88 passed, and earlier on 11 November passkey 143, Minecraft manager
  217, frontend storage 36, automation and dashboard history 157.
- Seen in a running build (build 2026.11.1.96, throwaway copy, 390 px wide): the Marketplace list
  scrolls with its group header pinned; on the Personal settings page the preview scrolls away and
  only the group chips stay pinned; the accessibility panel's rows no longer overlap (its text size
  "+" button wrapped onto its own line in that build; the batch 19 fix is unseen).
- Release pipeline, observed: every release carries the Deploy Assistant installers (v2026.11.1.88,
  .91, .93); runs replaced by a newer push are cancelled and leave no release; 37 empty releases
  were removed by hand.

## Not verified

- Not seen in any browser: update install progress and recovery card, the Minecraft server page,
  Ollama unload, model details and test chat, the support page and bundle, the save bar, the
  embedded page panel, media folder management, the "Add media" fix (reported broken on an iPhone;
  fixed in source only), the image upload button, hiding of the cloud service, the new converter
  formats, history search and version picker, the "Git remote" wording, Cantonese additions, the
  dashboard tools dialog, and everything from the batch before (authenticator card, activity tray,
  schedules, information buttons, split panes, starting points).
- A documentation-only push publishing no release has not been observed.
- The Minecraft manager has never been run against a real Docker host, the Ollama page never against
  a real server, and passkeys never with a real authenticator.
- No operating system image has been built since two unit files were renamed for Windows checkouts.
- `deploy-assistant\build.bat` (another lane's) has not been run by this work.
- The iPhone app's setup problems reported by the owner are not yet described.

## Known open

- The save bar can leave a blank strip when the phone's bottom bar hides on scroll.
- An old logbook entry can still name the cloud service as an actor, and a voice pipeline already
  set to a cloud voice shows a blank picker.
- Reading PDFs, MP3 output and video-to-video conversion are not offered.

## Next steps

1. Open each page listed under "Not verified" in the hosted build or a throwaway copy, starting
   with "Add media" on a phone; record what is seen in `docs/feature-status.md` and tick
   `ROADMAP.md` only then.
2. Watch the next documentation-only push for the absence of a release; build an operating system
   image and confirm the two renamed mount units are back under their real names.
3. Prove backups carry `automation_repos/` and `dashboard_repos/` (see `HANDOFF.md`).
4. Remaining board work: the Tools code generator (needs a credential vault), schedule triggers
   from entities and web services, the guided form worked example and practise control, the update
   dialog in the activity tray, draft recovery for editors, collapsible statistics.
