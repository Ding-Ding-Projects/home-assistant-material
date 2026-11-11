# Deploy Assistant

A desktop app that runs Home Assistant Material in one click and keeps every instance and its
backups in one place. Windows, Linux and macOS.

| Target | What one click does | Link you get |
| --- | --- | --- |
| Docker on this computer | Writes `compose.yaml` and a config folder, pulls the image, starts it, waits until it answers | `http://localhost:<port>` and the address for other devices |
| SSH host | Writes the same files in `~/home-assistant-material/<name>` on a Linux host with Docker, starts it there | `http://<host>:<port>` |
| VirtualBox | Downloads and checks the operating system disk, makes an EFI machine with a forwarded port, starts it | `http://localhost:<port>` |
| VMware | Downloads and checks the `.ova`, imports it with OVF Tool, starts it on VMware's NAT network | the address the machine reports |
| Raspberry Pi | Writes the Raspberry Pi 3, 4 or 5 image to an SD card or USB drive, reads it back, waits for the Pi | `http://homeassistant.local` |

Every instance gets its own name, port and folder, so there is no limit on how many. The instance
manager starts, stops, restarts, updates and removes them, shows logs and live processor and memory
use, and backs them up: now, or every day with a number kept. Every operating system image and the
container image are downloaded automatically and checked against their SHA-256 sums.

Writing a card needs administrator rights for that step only: the app asks the system (UAC on
Windows, the password dialog on macOS and Linux) and runs only `src/backend/writer.js` that way.

## Build and test

```
npm ci
npm test            # unit tests of configuration, ports, hosts and the backup schedule
npm start           # builds the page and opens the app
npm run make        # installers in out/make
```

`build-renderer.js` builds the window's page from `src/renderer/parts/` and the shared parts of the
project page (`docs/site/app.js`), so both keep one design. The same page runs on the project page
as a demo with `src/renderer/mock.js` standing in for the computer.

Releases come from `.github/workflows/deploy-assistant.yml`: Squirrel for Windows (`Setup.exe`,
`RELEASES`, `.nupkg`), a `.deb` and zips. Nothing is code-signed.

## Data

Instances, hosts and backups live in the app's data folder (Settings, Data folder). SSH passwords
are encrypted with the system keychain. Nothing is sent anywhere except what a deployment needs.

## Build it on Windows

From this folder, run `build.bat`. On a fresh Windows it needs nothing else: if Node.js 20 or newer,
Git or Python is missing it installs them with Chocolatey, and installs Chocolatey first when that is
missing too (Windows asks once for administrator rights). Then it installs the packages, runs
the tests, builds the window and makes the installer at
`out\make\squirrel.windows\x64\HAM-Deploy-Assistant-Setup.exe`, then confirms the installer is not
signed and prints its SHA-256. `build.bat run` starts the app from source instead, `build.bat clean`
starts from nothing, and `build.bat notest` skips the tests.
