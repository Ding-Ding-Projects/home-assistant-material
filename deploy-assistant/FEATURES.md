# Deploy Assistant feature inventory

Every feature the project's interface contract asks of a desktop app, and where the Deploy
Assistant stands on it. "Built" means it is in the app and was seen working in the browser demo
and, where it needs the computer, in Electron on Linux. Nothing here was checked on Windows or
macOS hardware unless it says so.

| Feature | State | Where, and what is missing |
| --- | --- | --- |
| First-run setup wizard | Built | Language, a check of every target, the default target; Back, Next, Skip, resumes where you left it. Settings, Start again reopens it. |
| Does not look like a website | Built | The Deploy tab is a two-pane wizard; no hero, no feature cards. |
| Extensions | Built | Manifest per folder, permissions asked and asked again when they change, own process, 15 s and 256 KB, no secrets. Missing: add from a folder, master off switch, recent runs list. |
| Languages: English, Cantonese, both | Built | Every label; the Cantonese copy covers labels and messages, articles are English. |
| Playfulness 1 to 5 per language | Built | Messages at five levels each. |
| Emoji in dialogs switch | Built | |
| Your wording file | Built | Settings upload and dropping a file on the window. Missing: the full-window celebration after a drop. |
| School mode | Partly built | Plain wording, playfulness 1, no sounds or surprise. Missing: one shared switch across all apps, renaming, unlock credential. |
| Narrator | Built | Off by default; English, Cantonese or both in turn; a voice picker per language with what is in effect; speed and pitch; one line at a time with a cooldown, failures always spoken. |
| Scheduled settings | Built | Rules by days, times and dates, or by a Home Assistant binary_sensor or input_boolean; later rules win; your own settings come back. Missing: an HTTPS API source, fonts in rules. |
| Dim sum surprise | Built | 1 in 10 at start, never on the first run; photo and names from the public catalog, cached in the app's data; the switch slides back on. The project page demo shows names only. |
| Dim sum code names | Built | Chosen by the release workflow from the public catalog, once per release; shown in releases, About and the Deploy tab. |
| Accessibility button | Built | Text size, contrast, motion, focus, larger targets, spotlight, read aloud with pause and stop, keyboard help, reset, and a separate Hide action; Settings shows it again. |
| Frameless window | Built | Own title bar and buttons. Missing: the Windows Snap overlay. |
| Info button on every setting | Built | With default and what it reaches. |
| Clear button in every text box | Built | Added to every editable field automatically. |
| Native browse for paths | Partly built | SSH key file. |
| Pattern workbench on every search | Built | The shared workbench. Missing: full RegexBuddy parity and its ledger. |
| Search on every menu and list | Built | Lists, menus, settings, palette, new tab. |
| ADHD modes | Built | Focus, Low stimulation, Time awareness, One thing at a time, Momentum; each off by default. |
| Notifications, not dialogs | Built | Toasts plus the notification bell. |
| No payment asked | Built | Stated in Settings, Updates. |
| Super confirmation | Built | Two keys, then a slider; emergency exit; focus returns. |
| Main colour, density, text size | Built | Missing: per-element Photoshop-depth editor and its animation tab. |
| Logo | Built | Presets, or your own PNG, JPEG or WebP checked by its bytes, with fill or fit, zoom, position and background. |
| File converter | Partly built | Tools, Convert: JSON and CSV to CSV, JSON, YAML, Markdown. Missing: files, images, PDF tools, queues. |
| Base64 toolkit | Partly built | Text and files, URL-safe, padding. Missing: MIME wrapping, data URLs, previews, history. |
| Virtual disk manager | Not started | Windows VHD, VHDX and VHD Set work. |
| Game server manager | Not started | |
| Local Ollama manager | Not started | |
| Tabs, all open by default | Built | Pinning, reordering, Open every tab, the New tab catalog. |
| Locks on elements | Built | Missing: the play-your-way-out unlock ladder. |
| Support tickets | Built | |
| Authenticator | Built | Base32 secrets, and QR codes from an image, a screenshot or the camera. Missing: drawing a QR code. |
| Offline documentation | Built | Help and Articles tabs. |
| Open in VS Code | Built | An instance's Compose file, and every export. |
| Export in every format | Built | JSON, JSONL, YAML, TOML, XML, CSV, TSV, Markdown, HTML, SQL, text. Missing: ZIP and 7z. |
| Bulk actions | Built | Instances, backups, hosts. Missing: notifications and history lists. |
| Record history | Built | Instances, hosts and the schedule; filter by action, date and words; restore adds a revision. |
| Changelog | Built | Each version links to its commit. |
| Command palette | Built | Live controls, teleports to the element. |
| Right-click menus with shortcuts | Built | Instance menu. |
| Progress where it started | Built | Deploys, Pi cards, downloads, the update self-test. |
| Filters and totals fold away | Built | |
| Version and build time shown | Built | Deploy tab, Changes, Settings. |
| Updates | Built | Windows background updates with an unsigned-update banner; a self-test; the app notes an applied update at its next start. Not yet seen updating on Windows. |
| Live chart | Built | Smooth line, live dot, crosshair by mouse or arrow keys, snaps under reduced motion. |
| Action sounds | Built | |
| Drawing and annotation | Not started | |
| Design boards | Built | In the Design tab and on canvases 16 to 18 of the design folder. |
