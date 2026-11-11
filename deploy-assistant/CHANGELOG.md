# Deploy Assistant changes

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
