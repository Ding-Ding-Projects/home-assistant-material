# Home Assistant Material

Home Assistant with a Material Design 3 interface, built from one repository: the frontend, the
core, the supervisor and the operating system, with releases for Raspberry Pi, VirtualBox and
Docker.

**Status: early.** The build and update pipeline works and publishes real images. The redesigned
interface exists as a complete design (153 boards on 11 canvases in [`design/`](design/)). The first part of it
is built: colours, typeface, navigation rail, floating pane, cards and tabs. Most features on the
boards are **not yet implemented**. See [`docs/feature-status.md`](docs/feature-status.md) for
exactly what is and is not done.

| I want to | Go to |
| --- | --- |
| Run it in Docker | [Run the container](#run-the-container) |
| Flash a Raspberry Pi or start a VirtualBox VM | [Operating system images](#operating-system-images) |
| Build it myself | [Build](#build) |
| See the design | [`design/README.md`](design/README.md) |
| Know what changed from upstream | [`docs/material-changes.md`](docs/material-changes.md) |
| See what is planned | [`ROADMAP.md`](ROADMAP.md) |

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
pull, start, health, both addresses, the log view, stop and the failure paths. **`host.bat` has
not been run on Windows yet.**

To use another port, set `HA_MATERIAL_PORT`. To move to a newer build, change the tag in
`compose.yaml` or set `HA_MATERIAL_TAG`.

## Operating system images

Each [release](https://github.com/Ding-Ding-Projects/home-assistant-material/releases) that
rebuilt the product attaches operating system images when its build jobs finish:

| Device | File |
| --- | --- |
| Raspberry Pi 5 | `haos_rpi5-64-<version>.img.xz` |
| Raspberry Pi 4 and 400 | `haos_rpi4-64-<version>.img.xz` |
| Raspberry Pi 3 | `haos_rpi3-64-<version>.img.xz` |
| VirtualBox | `haos_ova-<version>.vdi.zip` |

A release that changed only documentation or design files has no images; use the most recent
release that lists them. Check the file against `SHA256SUMS.<board>` from the same release.

## Build

The only requirement is Docker.

| System | Command | Result |
| --- | --- | --- |
| Windows | `.\build.bat --run` | Builds the container image and opens `http://localhost:8123` |
| Linux, macOS, WSL | `./build.sh --run` | The same |
| Windows | `.\build-installer.bat` | Builds the VirtualBox image into `dist\os` |
| Linux | `./build.sh os rpi5-64` | Builds an operating system image |

`download-dependencies.bat` and `download-dependencies.sh` install Docker when it is missing.
The Windows scripts have not been run on Windows yet; see the feature status page.

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

- The release workflow writes an update feed to the `channel` branch after each successful build.
- The supervisor in `supervisor/` reads that feed and pulls core and supervisor images from
  `ghcr.io/ding-ding-projects`.
- Every build has a version that sorts above the last one (`<core>.<build>`), so the update
  appears in Settings by itself.
- Operating system updates over the air need two repository secrets, `RAUC_CERTIFICATE` and
  `RAUC_PRIVATE_KEY`, holding one signing certificate and key in PEM form. Without them each
  image is signed with a one-time key and the feed offers no operating system update, so nothing
  fails halfway. Reflash to move to a newer operating system image in that case.
- Add-ons and the DNS, audio, CLI, multicast and observer images come from upstream unchanged.

</details>

<details>
<summary><strong>How releases work</strong></summary>

Every push to `main` runs `.github/workflows/release.yml`, which publishes one new release with
a unique tag (`v<core>.<build>`). A push that touches product files rebuilds the frontend wheel,
the container images, the update feed and the operating system images and attaches them. A push
that touches only `design/`, `docs/` or Markdown files publishes the release without rebuilding.

The workflow runs no tests and no lint, and each release says so. The release notes list the
result of every build job and the end-to-end time.

</details>

<details>
<summary><strong>Screenshots</strong></summary>

Taken from a running instance with a small sample home: three lights, two locks, a thermostat
and three scenes. The last one is the published container image run as it is; the others are
that container with the frontend of this repository mounted into it.

![Home in a running instance: a greeting, one sentence about the home and scene buttons](docs/screenshots/home-greeting.png)
![Settings home: a large title, a search and a grid of sections with live counts](docs/screenshots/settings-home.png)
![The System page](docs/screenshots/system-page.png)
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
