# Deploy Assistant changes

## 1.3

- ADHD modes, each off by default: Focus, Low stimulation, Time awareness, One thing at a time and Momentum.
- A narrator for what happens, off by default, in English, Cantonese or both, with a voice picker per language, speed and pitch.
- Schedule rules: change the theme, language, density, motion or colour by days, times and dates, or while a Home Assistant switch is on; your own settings come back afterwards.
- The dim sum surprise shows a photo from the public dim sum catalog, 1 time in 10 at start; its switch stays on. Each release has a dim sum code name.
- Deleting now takes two keys and a slider, with an emergency exit.
- The accessibility button gains read-aloud pause and stop, keyboard help, reset and a way to hide it.
- Your own logo from a picture, export in eleven text formats with Open in VS Code, bulk actions on backups and hosts, a history of your records with restore, a clear button in every text box, a live processor chart, and changelog links to each commit.
- FEATURES.md lists every feature the interface contract asks for and where the app stands.

## 1.2

- New tabs that work offline: Run it, Features, Articles, Status, and Design, which shows every board of this app's design full size.
- Tools, Authenticator: scan a one-time code's QR code from an image, a pasted screenshot or the camera.
- Settings, Updates: an update self-test walks the releases, the feed, the package and its checksums, the installer, and whether an update was seen applied after a restart, and lets you copy the result.
- After an update is applied, the app says so on its next start and keeps a record.
- Only the camera and clipboard writing are allowed to the window; every other permission is refused.

## 1.1

- The Deploy tab is a two-pane app: pick where it runs on the left, see and change everything it will do on the right, and deploy with one button or Ctrl Enter.
- New tabs: Extensions, Tools, Support and Changes.
- Extensions: add small helpers in their own folder. Each one says what it may see, asks before it starts and again when that changes, runs in its own process, and never receives passwords or keys. Health report and Link sheet come built in.
- Updates: on Windows the app updates itself in the background and asks you to restart. The update is not code-signed, and the banner says so. On macOS and Linux it tells you a new version is out.
- Settings: school mode, a reading voice, a dark theme on a schedule, your own name and logo, and the dim sum surprise (names only).
- The version and build time show on the first screen and in About.
- Open an instance's Compose file in VS Code, or its folder, from its menu.
- The filters and totals on Instances fold away.

## 1.0

- One-click deploys to Docker on this computer, an SSH host, VirtualBox and VMware, with a free port and name chosen for you and the link at the end.
- Raspberry Pi card writer for the Pi 3, 4 and 5, with a read-back check.
- Instance manager with start, stop, restart, update, logs, live processor use and backups on a schedule.
- Every image downloaded and checked automatically, here and on your SSH hosts.
