# Deploy Assistant feature inventory

Every feature the project's interface contract asks of a desktop app, and where the Deploy
Assistant stands on it. "Built" means it is in the app and was seen working in the browser demo
and, where it needs the computer, in Electron on Linux. Nothing here was checked on Windows or
macOS hardware unless it says so.

| Feature | State | Where, and what is missing |
| --- | --- | --- |
| First-run setup wizard | Built | Language, a check of every target, the default target; Back, Next, Skip, resumes where you left it. Settings, Start again reopens it. |
| Does not look like a website | Built | The Deploy tab is a two-pane wizard; no hero, no feature cards. |
| Extensions | Built | Manifest per folder, permissions asked and asked again when they change, own process, 15 s and 256 KB, no secrets; add from a folder, remove, a switch for all of them, recent runs. |
| Languages: English, Cantonese, both | Built | Every label; the Cantonese copy covers labels and messages, articles are English. |
| Playfulness 1 to 5 per language | Built | Messages at five levels each. |
| Emoji in dialogs switch | Built | |
| Your wording file | Built | Settings upload and dropping a file on the window, with a celebration that respects reduced motion. |
| School mode | Built | Shared with every Ding Ding Projects app on the computer through one file, followed live; it can be renamed and given a PIN (PBKDF2) to switch off; dim sum disappears entirely. |
| Narrator | Built | Off by default; English, Cantonese or both in turn; a voice picker per language with what is in effect; speed and pitch; one line at a time with a cooldown, failures always spoken. |
| Scheduled settings | Built | Rules by days, times and dates, or by a Home Assistant binary_sensor or input_boolean; later rules win; your own settings come back. Missing: an HTTPS API source, fonts in rules. |
| Dim sum surprise | Built | 1 in 10 at start, never on the first run; photo and names from the public catalog, cached in the app's data; the switch slides back on. The project page demo shows names only. |
| Dim sum code names | Built | Chosen by the release workflow from the public catalog, once per release; shown in releases, About and the Deploy tab. |
| Accessibility button | Built | Text size, contrast, motion, focus, larger targets, spotlight, read aloud with pause and stop, keyboard help, reset, and a separate Hide action; Settings shows it again. |
| Frameless window | Built | Own title bar; on Windows the system draws the window buttons, so Snap layouts work. Not yet seen on Windows hardware. |
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
| File converter | Partly built | Convert tab: type by bytes, eight categories with search, PDF inspect, split, merge, extract, reorder, rotate and metadata (each result reopened and checked), images, pictures to PDF, ZIP and gzip, data and text formats, a queue with pause, resume and cancel, lossy disclosures, history, results written whole beside the source or into a chosen folder. Missing: audio, video, Office and HEIC adapters (listed as unavailable with the reason), a queue that survives a restart, and conversion in a separate process. |
| Base64 toolkit | Built | Standard, URL-safe, MIME and custom lines, padding, strict decoding with offsets, four text encodings, data URLs both ways, files encoded and decoded beside the source with a SHA-256 round trip, previews, undo and redo, a JSON record and a ZIP of results. Missing: pause and resume for one very large file. |
| Virtual disk manager | Partly built | Library with format, type, sizes, smallest safe size, block and sector sizes, fragmentation, parent, partitions and attach state; create (with partition and format), attach (also at sign-in) and detach, grow and shrink, compact in every mode, convert, merge, child disks, online and read-only, VHD Set checkpoints; PowerShell and DiskPart scripts for each; one UAC prompt. Not yet run on Windows. Missing: copying a physical disk, SDDL filters in the form, a tree view of chains, change tracking. |
| Minecraft server manager | Partly built | Four targets; every Mojang version and the Paper, Purpur and Fabric catalogues; typed settings, game rules, players, Modrinth plugins and mods with SHA-512, backups, version changes with a backup first, a schedule, and a world generator with a chunk grid. Not yet run end to end here. Missing: Bedrock version history, Forge and NeoForge outside Docker, permission plugins, resource packs, proxies, and the per-version compatibility matrix. |
| Local Ollama manager | Partly built | Managed install from the official release (SHA-256) or Chocolatey, an owned process, the whole ollama.com library with every variant, fit verdicts, a pull list with parallel pulls and cancel, details, copy, unload, delete, chat. Not yet run against a real Ollama here. Missing: harness profiles, resumable pulls after a restart. |
| Tabs, all open by default | Built | Pinning, reordering, Open every tab, the New tab catalog. |
| Locks on elements | Built | With the unlock ladder: dim sum, ten sums, whack-a-mole, then the clock; School mode starts at the sums. |
| Support tickets | Built | |
| Authenticator and QR codes | Built | Base32 secrets, QR codes read from an image, a screenshot or the camera, and QR codes made from any text or a one-time code. |
| Offline documentation | Built | Help and Articles tabs. |
| Open in VS Code | Built | An instance's Compose file, and every export. |
| Export in every format | Built | JSON, JSONL, YAML, TOML, XML, CSV, TSV, Markdown, HTML, SQL, text, and a ZIP of all of them. Missing: 7z. |
| Bulk actions | Built | Instances, backups, hosts, notifications. |
| Record history | Built | Instances, hosts and the schedule; filter by action, date and words; restore adds a revision. |
| Changelog | Built | Each version links to its commit. |
| Command palette | Built | Live controls, teleports to the element. |
| Right-click menus with shortcuts | Built | Instance menu. |
| Progress where it started | Built | Deploys, Pi cards, downloads, the update self-test. |
| Filters and totals fold away | Built | |
| Version and build time shown | Built | Deploy tab, Changes, Settings. |
| Chocolatey setup | Built | Settings, Setup lists Docker Desktop, VirtualBox, VMware, Java, Git, Python, Node.js, Ollama, VS Code and OpenSSH, and installs what is missing in one click (Chocolatey first if needed); the Deploy tab offers it where a target needs setup; build.bat installs Node.js, Git and Python the same way. Not yet run on Windows. |
| Updates | Built | Windows background updates with an unsigned-update banner; a self-test; the app notes an applied update at its next start. Not yet seen updating on Windows. |
| Live chart | Built | Smooth line, live dot, crosshair by mouse or arrow keys, snaps under reduced motion. |
| Action sounds | Built | |
| Drawing and annotation | Partly built | Draw tab: seven pens with their own dynamics, an area eraser, Shift for straight lines, a toolbar that changes shape, undo and redo, SVG and PNG at 1x to 3x, saved strokes, drawing on a picture. Missing: drawing over every screenshot and preview in place, docking and dragging the toolbar. |
| Design boards | Built | In the Design tab and on canvases 16 to 18 of the design folder. |
