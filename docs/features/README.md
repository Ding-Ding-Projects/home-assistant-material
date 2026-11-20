# Feature documentation

One Markdown file for each feature, grouped by category. Each category has its own `README.md`
index. Every file says what the feature does, how it is configured, how it fails, what it
protects, and what has really been verified. The current state of each feature is its item in
[`../../ROADMAP.md`](../../ROADMAP.md), and what is live is in [`../../HANDOFF.md`](../../HANDOFF.md);
a file here never claims more than its roadmap item. [`../feature-status.md`](../feature-status.md)
is the older row-by-row record (10 to 13 November 2026), kept for its history.

| Category | What it covers |
| --- | --- |
| [`setup/`](setup/README.md) | First-run setup, guided setup for integrations, Google setup |
| [`access/`](access/README.md) | Passkey sign-in and locks |
| [`language-and-voice/`](language-and-voice/README.md) | Language modes, playfulness, narrator and read aloud, School mode, attention modes, schedules and shared defaults, settings saved on the instance |
| [`help-and-privacy/`](help-and-privacy/README.md) | Offline help, the problem log, link confirmation |
| [`backups/`](backups/README.md) | Restoring official Home Assistant backups and the version rule |
| [`integrations/`](integrations/README.md) | Exporting and importing the list of integrations and one integration's settings |
| [`tools/`](tools/README.md) | File converter and drawing board |
| [`automations/`](automations/README.md) | Testing and running a Choose step, the automation and script editors |
| [`history/`](history/README.md) | Bounded comparison with earlier numeric history, missing data and export behavior |
| [`dashboards/`](dashboards/README.md) | Editing built-in pages, export, import; history is in `dashboard-history/` |
| [`interface/`](interface/README.md) | Search from the top bar, notifications, export, selection bar, entity dialogs and sheets, accessibility spacing and fonts, status screens, activity tray and recovery, split panes, information buttons, starting points |
| [`dashboard-history/`](dashboard-history/README.md) | Git history for every dashboard and every tab, with remote and push |
| [`minecraft-server/`](minecraft-server/README.md) | Minecraft server manager (second slice: Docker over SSH) |
| [`ollama/`](ollama/README.md) | Local Ollama suite (second slice: pull and delete) |
| [`hosting/`](hosting/README.md) | The full hosting mode: one container with its own Docker engine, so apps, the app store, backups with apps and real updates work |
| [`apps/`](apps/README.md) | Install progress and the log terminal for apps from the app store |
| [`media/`](media/README.md) | Dropping a picture, video or audio file on any page to add it to Media or Images |
| [`marketplace/`](marketplace/README.md) | Adding an item from a ZIP archive, detected without a history folder |
| [`activity-record/`](activity-record/README.md) | Permanent record of the Activity page in a Git repository: what is kept, what can still be lost, size and the Permanent record page |
| [`camera-recording/`](camera-recording/README.md) | Recording cameras around the clock to a disk, a folder, a Windows share or an SSH server with guided setup, the event timeline under the camera player, event clips (Play only with a real clip) and live video recorded around events |
| [`updates/`](updates/README.md) | Update progress and the queue, the "Update coming soon" card, which updates get a backup first, Notes and "What's new", automatic system updates |
| [`defenders/`](defenders/README.md) | AC Defender and Heat Defender integrations: guards, shared comfort band, the heating floor, restart memory |

Other documents: [`../automation-repositories.md`](../automation-repositories.md) for the Git
repository of each automation, and [`../../deploy-assistant/FEATURES.md`](../../deploy-assistant/FEATURES.md)
for the Deploy Assistant.

This product has no HTTP API of its own beyond the upstream one, so there is no Postman
collection for these categories. The server commands each feature adds are WebSocket commands,
listed in the file for that feature.

## Not built yet

Boards that exist in `design/` and are not built. The state of each is in
[`../../ROADMAP.md`](../../ROADMAP.md).

- **Extensions (the sandboxed store).** An Extensions page with recorded consent exists (see
  [`interface/extensions-and-job-progress.md`](interface/extensions-and-job-progress.md)). The
  rest needs a server part that does not exist: a store of installed extensions, a sandboxed
  process for each, a permission record per version and a log. The interface must go through the
  marketplace's trust flow, never around it.
- **Handoff (editor and forge).** Opening in an editor needs a way to detect an installed editor
  add-on; publishing sends the configuration out of the instance, so it needs a server part with
  credential storage and a preview of exactly what is sent.
- **Dim sum surprise.** Needs a global notice shown at most once a launch, a local image
  catalogue (the board's photo slot must not load from an outside site) and a decision on the
  board's switch that cannot be turned off.
- **Unlock ladder.** Needs server-side one-time tickets so answers are checked by the server, and
  each of the four games; only the waiting steps exist.
- **Embedded.** The iframe panel exists but lacks the board's status chip, an open-in-new-window
  button and the notice about pages that refuse to be framed; it is outside the settings pages.
