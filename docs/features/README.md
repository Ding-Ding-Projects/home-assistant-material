# Feature documentation

One Markdown file for each feature, grouped by category. Each category has its own `README.md`
index. Every file says what the feature does, how it is configured, how it fails, what it
protects, and what has really been verified. The authoritative state of each feature is the row
in [`../feature-status.md`](../feature-status.md); a file here never claims more than that row.

| Category | What it covers |
| --- | --- |
| [`setup/`](setup/README.md) | First-run setup, guided setup for integrations, Google setup |
| [`access/`](access/README.md) | Passkey sign-in and locks |
| [`language-and-voice/`](language-and-voice/README.md) | Language modes, playfulness, narrator and read aloud, School mode, attention modes |
| [`help-and-privacy/`](help-and-privacy/README.md) | Offline help, the problem log, link confirmation |
| [`tools/`](tools/README.md) | File converter and drawing board |
| [`automations/`](automations/README.md) | Testing and running a Choose step, the automation and script editors |
| [`dashboards/`](dashboards/README.md) | Editing built-in pages, export, import; history is in `dashboard-history/` |
| [`interface/`](interface/README.md) | Notifications, export, selection bar, entity dialogs, accessibility spacing and fonts, status screens |
| [`dashboard-history/`](dashboard-history/README.md) | Git history for every dashboard and every tab, with remote and push |
| [`minecraft-server/`](minecraft-server/README.md) | Minecraft server manager (first slice) |
| [`ollama/`](ollama/README.md) | Local Ollama suite (first slice) |

Other documents: [`../automation-repositories.md`](../automation-repositories.md) for the Git
repository of each automation, and [`../../deploy-assistant/FEATURES.md`](../../deploy-assistant/FEATURES.md)
for the Deploy Assistant.

This product has no HTTP API of its own beyond the upstream one, so there is no Postman
collection for these categories. The server commands each feature adds are WebSocket commands,
listed in the file for that feature.
