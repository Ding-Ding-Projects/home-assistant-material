# Home Assistant Material

Home Assistant with a Material Design 3 interface, built from one repository: the frontend, the
core, the supervisor and the operating system, with releases for Raspberry Pi, VirtualBox and
Docker.

**Status: early.** The build and update pipeline works and publishes real images. The redesigned
interface exists as a complete design (265 boards on 20 canvases in [`design/`](design/)). A large
part of it is now written: the shell, many settings and tools pages, passkey sign-in, Google setup,
dashboard history, offline help, language modes and a converter and drawing board. Much of that is
checked only by lint, the type check and unit tests and has **not yet been seen in a running
build**; a few server parts were run on a running copy. Several features on the boards are not
built at all. [`docs/feature-status.md`](docs/feature-status.md) says, row by row, which is which,
and [`docs/features/`](docs/features/README.md) documents each feature. The Deploy Assistant
desktop app has its own [folder](deploy-assistant/README.md).

| I want to | Go to |
| --- | --- |
| Run it in Docker | [Run the container](#run-the-container) |
| Flash a Raspberry Pi or start a VirtualBox VM | [Operating system images](#operating-system-images) |
| Build it myself | [Build](#build) |
| Deploy in one click (Docker, SSH host, VirtualBox, VMware, Raspberry Pi card) | [`deploy-assistant/`](deploy-assistant/README.md), downloads on the project page |
| See the project page | [ding-ding-projects.github.io/home-assistant-material](https://ding-ding-projects.github.io/home-assistant-material/) |
| See the design | [`design/README.md`](design/README.md) |
| Know what changed from upstream | [`docs/material-changes.md`](docs/material-changes.md) |
| See what is planned | [`ROADMAP.md`](ROADMAP.md) |

## Try the interactive demo

The [screenshot gallery](https://ding-ding-projects.github.io/home-assistant-material-gallery/) shows two reviewed automation editor workflows from synthetic browser sessions, with source revisions and capture evidence.

Open the [browser demo](https://ding-ding-projects.github.io/home-assistant-material/demo/) to use the
Home Assistant Material interface with a sample home. The [speech options example](https://ding-ding-projects.github.io/home-assistant-material/demo/#/config/automation/edit/demo_action_options)
and the [media picker example](https://ding-ding-projects.github.io/home-assistant-material/demo/#/config/automation/edit/demo_play_media)
open the real automation editor. The [sample dashboard](https://ding-ding-projects.github.io/home-assistant-material/demo/#/lovelace/home)
includes an editable Repairs card. Save a change and reopen an example to see it in your browser.
The [to-do item example](https://ding-ding-projects.github.io/home-assistant-material/demo/#/config/automation/edit/demo_todo_item)
lets you pick an existing shopping item and mark it complete. Actions in the demo affect sample
entities only.

## Run the container

```
docker run -d --name homeassistant --restart unless-stopped --network host -v /path/to/config:/config ghcr.io/ding-ding-projects/home-assistant-material:latest
```

Open `http://<host>:8123`. The image is built for `amd64` and `arm64`. Without `--network host`,
use `-p 8123:8123`; device discovery is weaker that way.

### One step, with Docker Compose

`compose.yaml` in this repository runs a fixed build of the published image, publishes port 8123
to your network and keeps settings in `./config`.

| On | Run | What it does |
| --- | --- | --- |
| Windows | `host.bat` | Asks which mode to use. `host.bat --detached` starts it in the background; `host.bat --logs` starts it and stays in a live status and log view; `host.bat --stop` stops it. |
| Linux, macOS | `./host.sh` | The same modes: `--detached`, `--logs`, `--stop`. |

Each start pulls the image, starts the container, waits until it answers, and prints the address
for this machine and for your network. If Docker is missing or not running, the pull fails, the
port is taken, or nothing answers within five minutes, the script says so and exits with an
error. Leaving the log view does not stop anything. `host.sh` has been run for real on Linux:
pull, start, health, both addresses, the log view, stop and the failure paths. `host.bat
--detached` has been run on Windows 11 with Docker Desktop: pull, start, health and both
addresses, and the page answered from a second device on the network. Its menu, log view and
stop have not been run on Windows yet.

To use another port, set `HA_MATERIAL_PORT`. To move to a newer build, change the tag in
`compose.yaml` or set `HA_MATERIAL_TAG`.

### Full mode: apps, the app store, backups with apps and real updates

The mode above runs the core alone, so everything that needs the Supervisor is missing. Add
`--full` (`host.bat --full --detached`, `./host.sh --full --detached`, or
`docker compose -f compose.full.yaml up -d`) to run one outer container that has its own small
Docker engine; inside it the Supervisor starts the core and every app as sub-containers. The
computer sees one container. It needs `privileged: true` (read what that means in
[`docs/features/hosting/full-mode.md`](docs/features/hosting/full-mode.md) first), a few
gigabytes for the first start, and a named volume. Physical hardware stays out of reach and the
product never restarts or shuts down the computer. The article lists what was and was not
verified: in particular the release job that publishes the outer image has not been run yet,
and the currently published Supervisor image needs the next release before this mode is healthy.

## Operating system images

Each [release](https://github.com/Ding-Ding-Projects/home-assistant-material/releases) that
rebuilt the product attaches operating system images when its build jobs finish:

| Device | File |
| --- | --- |
| Raspberry Pi 5 | `haos_rpi5-64-<version>.img.xz` |
| Raspberry Pi 4 and 400 | `haos_rpi4-64-<version>.img.xz` |
| Raspberry Pi 3 | `haos_rpi3-64-<version>.img.xz` |
| VirtualBox | `haos_ova-<version>.vdi.zip` |
| VMware Workstation | `haos_ova-<version>.ova` |

A release that changed only documentation or design files has no images; use the most recent
release that lists them. Check the file against `SHA256SUMS.<board>` from the same release.

The operating system serves the interface on port 80: open `http://<address of the machine>/`.
Port 8123 redirects there.

### VMware Workstation

`haos_ova-18.5.33.ova` has been imported and started on VMware Workstation on Windows 11. It
took an address from the network through its bridged adapter, finished its first start and
showed the first-run setup. Check the file against `SHA256SUMS.ova` first, then:

```
ovftool --skipManifestCheck haos_ova-<version>.ova <folder>
vmrun start <folder>\<name>\<name>.vmx nogui
```

`--skipManifestCheck` is needed: `ovftool` 9.1.1 refuses the file otherwise, saying the disk
does not match the manifest, although both digests in the manifest are correct. The cause is
not yet found. Give the machine 4 GB of memory in its `.vmx` file (`memsize = "4096"`) if you
can; it is created with 2 GB.

## Cloning on Windows

A plain clone works on Windows:

```
git clone https://github.com/Ding-Ding-Projects/home-assistant-material
```

Earlier, two files under `operating-system/` had a backslash in their names, which Windows
cannot create, and a clone stopped with "invalid path" and "Clone succeeded, but checkout
failed". Those two files are now stored under names Windows accepts, and the operating
system build puts the real names back.

If a clone made before that fix shows the error, bring it up to date instead of cloning
again:

```
cd home-assistant-material
git fetch origin
git reset --hard origin/main
```

`git reset --hard` discards local changes in that folder, so use it only in a clone that
never finished checking out. If the error still appears, the copy of Git is refusing the
old history: run `git config core.protectNTFS false` in the clone and repeat the last
command.

## Build

The only requirement is Docker.

| System | Command | Result |
| --- | --- | --- |
| Windows | `.\build.bat --run` | Builds the container image and opens `http://localhost:8123` |
| Linux, macOS, WSL | `./build.sh --run` | The same |
| Windows | `.\build-installer.bat` | Builds the VirtualBox image into `dist\os` |
| Linux | `./build.sh os rpi5-64` | Builds an operating system image |
| Windows | `deploy-assistant\build.bat` | Builds the Deploy Assistant's `HAM-Deploy-Assistant-Setup.exe` into `deploy-assistant\out\make` |
| Windows | `deploy-assistant\build.bat run` | Builds and starts the Deploy Assistant desktop app from source |

`download-dependencies.bat` and `download-dependencies.sh` install Docker when it is missing.
The Deploy Assistant script needs Node.js 20 or newer; see `deploy-assistant/README.md`.
Ready-made Deploy Assistant installers are attached to every release.

### If `build.bat` stops with "Segmentation fault" or "exit code 139"

The frontend compile used to start one worker for every processor, which on a machine with
many processors needs more memory than Docker Desktop has, and it crashed part way through
`gulp build-app`. The build now compiles on four processors and tries once more on two if
that fails. Update the folder (`git pull`, or download it again) and run `build.bat` again.
On Windows 11 with 32 processors the build crashed before this change and finished after
it. If it still stops, give Docker more memory (Docker Desktop, Settings, Resources) or
build with fewer processors:

```
docker build -f build/frontend.Dockerfile --build-arg BUILD_WORKERS=2 --output type=local,dest=core frontend
```

<details>
<summary><strong>What is in this repository</strong></summary>

Home Assistant is developed across several repositories. Each is vendored here in its own
subfolder at a pinned release, so everything builds from one checkout.

| Folder | What it is |
| --- | --- |
| `frontend/` | The web interface. This is where the Material Design 3 work goes. |
| `core/` | Home Assistant Core. |
| `supervisor/` | The supervisor that manages updates, backups and add-ons on the operating system. |
| `operating-system/` | The operating system, including Buildroot. |
| `landingpage/` | The page shown while the system prepares on first boot. |
| `version/` | A snapshot of the upstream update feed, used as the base for this project's feed. |
| `design/` | Design canvas, sources and review frames. |
| `build/`, `scripts/` | Build definitions and release scripts. |
| `docs/` | Changes to upstream, feature status. |

`UPSTREAM.md` records the exact upstream release and commit of each folder.

</details>

<details>
<summary><strong>How updates work</strong></summary>

A system installed from this project updates from this project, not from upstream:

- The release workflow writes an update feed to the `channel` branch only after the release for that build is complete.
- The supervisor in `supervisor/` reads that feed and pulls core and supervisor images from
  `ghcr.io/ding-ding-projects`.
- Every build has a version that sorts above the last one (`<core>.<build>`), so the update
  appears in Settings by itself.
- Operating system updates over the air are signed with one certificate and key held in the
  repository secrets `RAUC_CERTIFICATE` and `RAUC_PRIVATE_KEY` (PEM form). They were set on
  10 November 2026 with a self-signed certificate made for this project, so every build after
  build 55 that finishes its operating system images offers them in the update feed.
- Images from builds up to 55 were signed with one-time keys that no longer exist. A system
  installed from one of them cannot take an operating system update; install it once more
  from a newer image. Its core and supervisor still update by themselves.
- In a copy of this repository without those two secrets, each image is signed with a one-time
  key and the feed offers no operating system update, so nothing fails halfway.
- Add-ons and the DNS, audio, CLI, multicast and observer images come from upstream unchanged.

</details>

<details>
<summary><strong>How releases work</strong></summary>

Every push to `main` runs `.github/workflows/release.yml`. A push that touches product files
rebuilds the frontend wheel, the container images and the operating system images. No release
exists while those jobs run: each job hands its files to a last job, which creates one normal
release (never a draft or a prerelease) with a unique tag (`v<core>.<build>`) only when every
build job of the run succeeded. That job reads the release back, checks every file and size, and
only then moves the update feed on the `channel` branch. If anything fails, it removes the release
and its tag, so a release is either complete or absent.

The release waits for the operating system images, which take one to two hours: a run whose
operating system jobs fail or are cancelled publishes nothing, and there is no release without
them. Container images are not releases. They are pushed by their own jobs, so the hosted
instance can move to a build before it finishes, and an image tag can exist for a build that never
becomes a release. A run that publishes nothing leaves a gap in the build numbers.

Runs are queued one at a time. A run that has started is never cancelled by a newer push; at
most one newer run waits, and a still newer push replaces the waiting run before it starts. Each
run compares itself with the last build that really has a release (the update feed names it), so
the code of a replaced or failed run is built by the next run. A push that touches only
`design/`, `docs/`, `deploy-assistant/` or Markdown files, with no product file changed since
that build, builds and publishes nothing.

The workflow runs no tests and no lint, and each release says so. The release notes list the
result of every build job and the end-to-end time.

</details>

<details>
<summary><strong>Screenshots</strong></summary>

Taken from a running instance with a small sample home: three lights, two locks, a thermostat
and three scenes. The last one is the published container image run as it is; the others are
that container with the frontend of this repository mounted into it.

The first nine are from a published build, run as it is with a small test home: the side
navigation pane, the page as its own card and the floating tool pill. Home, settings home,
the System page, home on a phone, the automation editor and the Updates page are from build
2026.11.1.437 (13 November 2026); storage and performance are from build 2026.11.1.413; the
animation page is from build 2026.11.1.371. Earlier versions of the replaced pictures are in
this file's history.

![Home: the navigation pane, a greeting, and a card for what needs attention](docs/screenshots/home-greeting.png)
![Settings home: a large title, a search and a grid of sections with live counts](docs/screenshots/settings-home.png)
![The System page](docs/screenshots/system-page.png)
![Animation and transitions: profiles, a switch per kind of element, a curve editor and a live preview](docs/screenshots/motion-editor.png)
![Home on a phone, with the floating bottom bar](docs/screenshots/phone-home.png)
![The automation editor: add a trigger, condition or action at the top, and the Simple, Advanced and YAML switch](docs/screenshots/automation-editor.png)
![The published speech demo with a known audio format and a saved custom speed option](docs/screenshots/automation-speech-dictionary-demo.png)
![The published Repairs editor at phone width with the Vertical setting enabled](docs/screenshots/published-repairs-editor.png)
![The local dashboard fallback editor at 360 pixels with icon, navigation, and entity ordering controls](docs/screenshots/dashboard-visual-fallback-360.png)
![Storage: a ring for the recorder database and the entities that use the most](docs/screenshots/storage-page.png)
![Performance: how a dashboard loads, and the offline cache](docs/screenshots/performance-page.png)
![Updates: automatic updates for everything, with a backup first](docs/screenshots/updates-page.png)
![The Devices list: breadcrumb, large title with a summary line, rows as cards](docs/screenshots/list-page-devices.png)
![Search this page, with the matches highlighted](docs/screenshots/page-tools-find.png)
![Export this page](docs/screenshots/page-tools-export.png)
![A locked page](docs/screenshots/page-tools-lock.png)
![A locked element with a dashed outline, and the Lock tool listing it](docs/screenshots/element-lock.png)
![Two-key confirmation before a destructive action](docs/screenshots/two-key-confirmation.png)
![Search inside a dialog](docs/screenshots/dialog-tools-find.png)
![The pattern workbench beside a search field](docs/screenshots/pattern-workbench.png)
![The appearance editor for one element](docs/screenshots/appearance-editor.png)
![The automation history manager](docs/screenshots/automation-history-run.png)
![The Base64 toolkit](docs/screenshots/base64-toolkit.png)
![The Colour tab](docs/screenshots/colour-tool.png)
![Notifications as a page](docs/screenshots/notifications-page.png)
![The About page](docs/screenshots/about-page.png)
![What changed, the changelog inside the interface](docs/screenshots/what-changed.png)
![The published container image, build 34, run as it is: a page exported to CSV](docs/screenshots/published-34-export.png)

Older captures, from the frontend's demo build, which runs the real interface against sample
data:

![The bar of open pages with the New tab catalog, in the demo build](docs/screenshots/tabs.png)
![The accessibility tools panel in the demo build](docs/screenshots/accessibility.png)
![The same page at Most contrast and 125% text](docs/screenshots/contrast.png)
![The Energy dashboard in the demo build, with pill tabs](docs/screenshots/energy.png)
![The Map page in the demo build](docs/screenshots/map.png)

</details>

<details>
<summary><strong>Design preview</strong></summary>

These are renders of the design files, not screenshots of the product.

![Design render of the Home screen](design/frames/Main.png)
![Design render of the Energy screen in the dark theme](design/frames/Energy.png)
![Design render of the Settings screen](design/frames/Settings.png)

</details>

## Licence

Apache-2.0 for this project's own files; each vendored folder keeps its own licence. This is an
independent project, not affiliated with or endorsed by Home Assistant or the Open Home
Foundation. See [`NOTICE.md`](NOTICE.md).
