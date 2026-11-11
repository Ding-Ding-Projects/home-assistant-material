# Full hosting mode

The plain hosting mode (`compose.yaml`) runs the core alone in one container. Everything Home
Assistant does through its Supervisor is missing there: the app store, apps opening inside the
interface, backups that include apps, real core and Supervisor updates with the install
progress screen, and the host and system pages.

The full mode (`compose.full.yaml`) adds that. **One outer container runs its own small Docker
engine. Inside it, the Supervisor starts, and the Supervisor starts the core and every app as
sub-containers**, in the same way it does on the operating system image. The computer that
hosts the outer container sees one container and nothing else.

```
your computer
└── Docker
    └── home-assistant-material-full          (one privileged container)
        └── inner Docker engine
            ├── hassio_supervisor
            ├── homeassistant                  (the core, this product's interface)
            ├── hassio_dns, hassio_audio, hassio_multicast, hassio_observer, hassio_cli
            └── app_<name>                     (one per installed app)
```

## What becomes possible

All of the following were run against a real instance in this mode (see "What was verified").

- The app store, with the official repository, the community repository and any repository you
  add by its address.
- Installing, starting, stopping and removing apps; app pages open inside the interface
  (ingress) on a phone-width and a wide screen.
- Full and partial backups that include apps, and restoring them, including bringing back an
  app that was uninstalled.
- Installing a core update from Settings, System, Updates with the install progress screen.
- A clean stop and start: stopping the outer container stops the core and the apps in order,
  and starting it brings everything back by itself with its data.

## What stays impossible, and why

- **Physical hardware.** USB devices, serial adapters, Bluetooth and radios are not passed
  into the outer container, so apps that need them fail or warn. This is deliberate.
- **Restarting or shutting down the computer.** The interface still shows "Reboot system" and
  "Shut down system", because the Supervisor reports itself as having a host. Pressing them
  does nothing to the computer: the Supervisor answers "No reboot D-Bus connection available"
  (or "No shutdown ..."), because there is no D-Bus and no systemd inside the container. The
  worst case of any host control is an error message.
- **Host pages that need an operating system.** Hardware, host storage, network settings of
  the host, operating system updates and the host's logs report nothing (`hostname`, `kernel`
  and `operating_system` are empty in the Supervisor's host information).
- **Device discovery by broadcast.** The inner engine has its own network, so mDNS and SSDP
  from the real network are not seen by the core. Add such devices by address.
- **The Supervisor reports "unsupported".** It lists `apparmor`, `dbus`,
  `docker_configuration`, `network_manager`, `os`, `os_agent`, `systemd`, `systemd_journal`
  and `systemd_resolved`. This does not block anything the mode offers. It is expected, and
  it is why Home Assistant's own support rules do not apply to this mode.

## What "privileged" means here

Docker cannot run a Docker engine inside a container without `--privileged` (the compose file
sets `privileged: true`). A privileged container has nearly the same rights over the Docker
host as a process running on it as root. Nothing broader is requested: the container does not
use the host network, the host process namespace or the host's Docker socket, and it mounts only
its own named volume. Even so, a bug that escapes a privileged container reaches the host, so
only run the image you trust, and do not run it on a machine whose other containers must be
isolated from a possible escape. Apps installed from third-party repositories run as
sub-containers with the rights they ask for, inside this boundary.

## Requirements and cost

- Docker with Compose, on Linux, Windows (Docker Desktop) or macOS. The data volume must be a
  Linux filesystem, which a named Docker volume is. Do not replace it with a Windows or macOS
  folder.
- Memory, as measured on Docker Desktop 6.18 (WSL2): about 745 MiB with the core and the
  Supervisor's plugins and no apps, about 900 MiB to 1 GiB with four small apps running (the
  core about 420 MiB, the Supervisor about 125 MiB, a small app 7 to 90 MiB).
- Disk, as measured: about 7.1 GB on the data volume right after a first start (the inner
  engine's images), about 8.4 GB after installing six apps and a core update. Add the space for
  the apps you install and for backups.
- Time, as measured on a fast connection: about 170 seconds from `docker run` on an empty
  volume until the core answers, including all downloads. A start with everything already
  present took about 30 seconds.
- Network: the first start and every install download from `ghcr.io`, GitHub and Docker Hub.

## Start

```
host.bat --full --detached        (Windows)
./host.sh --full --detached       (Linux, macOS)
```

or

```
docker compose -f compose.full.yaml pull
docker compose -f compose.full.yaml up -d
```

Open `http://<this machine>:8123` (the port is `HA_MATERIAL_PORT`). `--full` can be combined
with `--logs` and `--stop`. The first start downloads several gigabytes, so the wait is longer
than in the plain mode; `host.bat` and `host.sh` wait up to 20 minutes in the full mode.

The outer image is tagged with the core version, as `home-assistant-material-full:<version>`,
and `latest`. The compose file uses `latest` unless you set `HA_MATERIAL_FULL_TAG`. The core,
the Supervisor and the plugins inside are downloaded by the Supervisor from this product's
update feed (the `channel` branch, `stable.json`), the same feed the operating system images
use, not from upstream's.

## Stop

`docker compose -f compose.full.yaml stop` or `host.bat --full --stop`. The outer container asks
the Supervisor to stop (which stops the core and the apps), stops anything left, then stops the
inner engine. This takes about ten seconds on an idle instance. The compose file allows three
minutes before Docker gives up. Data is kept on the volume `ha-material-full-data`.

## Update

- **The core, apps and plugins** update from the interface (Settings, System, Updates), as on any
  Supervisor-based install.
- **The Supervisor** updates itself: it downloads the new image and exits, and the outer
  container starts the new one. The core and the apps keep running during that.
- **The outer image** (the inner engine and the start script) updates with
  `docker compose -f compose.full.yaml pull` and `up -d`. The volume is kept.

## Back up

Use the interface (Settings, System, Backups); backups include apps and are stored on the
volume. A backup that never leaves the volume is not a safe backup: download it from the
backup's page or copy it out of the volume. To copy the whole volume:

```
docker run --rm -v ha-material-full-data:/data:ro -v "$PWD":/out alpine tar czf /out/ha-material-full-data.tar.gz -C /data .
```

Stop the container first for a consistent copy.

## Move the settings of a plain instance into the full mode (optional)

This copies the plain instance's `config` folder into the full mode's volume. The plain folder
is not changed or moved. Do it before the first start of the full mode, with the plain
container stopped:

```
docker volume create ha-material-full-data
docker run --rm -v "$PWD/config:/from:ro" -v ha-material-full-data:/to alpine sh -c "mkdir -p /to/supervisor/homeassistant && cp -a /from/. /to/supervisor/homeassistant/"
```

The copy command was run on a throwaway folder and volume and the files arrived in the place
the core reads them from. Starting a real migrated instance was **not** run. Two things to check
after the first start: the core listens on port 80 inside the container (the Supervisor decides
this), so a migrated `.storage/http` that sets another `server_port` must be changed back to 80
or the published port will not answer; and integrations that depend on the plain mode's host
networking (device discovery) behave as described under "What stays impossible".

## Go back to the plain mode

`docker compose -f compose.full.yaml down` removes the container and keeps the volume. Start the
plain mode with `host.bat` or `./host.sh` (without `--full`). The plain mode reads `./config`,
not the volume, so copy the settings out first if you want them
(`docker cp home-assistant-material-full:/var/lib/ha-material/supervisor/homeassistant/. ./config`
with the container running or stopped). Remove the volume with `docker volume rm
ha-material-full-data` only when you no longer need anything in it.

## How it works

`hosting/full/Dockerfile` builds the outer image on the official `docker:29.4.0-dind` image
(pinned by version). `hosting/full/entrypoint.sh` is the equivalent of the operating system's
`haos-supervisor` service:

1. Start the inner Docker engine with its data on the volume, and wait until it answers.
2. Add the firewall rules the Supervisor normally asks systemd to add, so that its bridge
   gateway is protected from outside traffic. They are added in the outer container's own
   network namespace, where the bridge lives. The Supervisor is told, with
   `SUPERVISOR_FIREWALL_EXTERNAL=1`, not to try itself (it cannot: there is no systemd).
3. Download the Supervisor image for this processor architecture, at the version the update
   feed names (or `HA_SUPERVISOR_VERSION` if set), and create its container with the same
   arguments the operating system service uses, minus what only a real host has.
4. Forget the stored boot time, so that the Supervisor treats starting the outer container as a
   boot and starts the core and the apps. (A container does not change the host's boot time, so
   without this the Supervisor would think only it had restarted and leave the core stopped.)
5. Supervise: when the Supervisor exits (after updating itself) start it again.
6. On a stop signal: stop the Supervisor, stop anything left, stop the engine.

The core runs with host networking inside the outer container, so its port is the outer
container's own port; that is why the compose file publishes container port 80.

## What was verified

Run on Docker Desktop 6.18 (WSL2, Docker 29.6) with a throwaway container, using a Supervisor
image rebuilt locally from this repository (see below):

- The inner engine starts, the Supervisor runs inside it and reports healthy, the core is
  downloaded and started by the Supervisor, and the interface answers on the published port.
- The app store lists 96 apps from five repositories (official 24, community 62, Music Assistant
  7, ESPHome 3), and 141 more after adding `https://github.com/alexbelgium/hassio-addons`
  through the Repositories page.
- File editor, Mosquitto broker, Terminal & SSH, The Lounge, CEC Scanner, Dnsmasq and AirCast
  installed; File editor, Mosquitto, Terminal & SSH, The Lounge and AirCast started and ran as
  sub-containers (`docker ps` inside the outer container) while `docker ps` on the host showed
  only the outer container. File editor and The Lounge opened inside the interface at 390 px
  and 1440 px. Mosquitto was uninstalled and brought back from a backup.
- CEC Scanner (hardware) stops at once with exit code 0 and nothing found; The Lounge (needs
  options) stopped with a clear log message until configured; AirCast, which asks for host
  networking, runs on the outer container's network, not the computer's. None of this affected
  the Supervisor.
- A full backup including six apps was created and a full restore completed (an app installed
  after the backup was removed, as a full restore does).
- Downgrading the core to the previous build made an update available; installing it from
  Settings, System, Updates showed the progress screen and ended on the newer version.
- Stopping and starting the outer container brought the core back in about 30 seconds and the
  apps after it.
- "Reboot system" in the interface and the Supervisor's reboot and shutdown calls changed
  nothing on the computer or on its other containers.

## What was not verified, and known limits

- **The release workflow job that publishes the outer image has not been run.** It is written
  like the other image jobs and the image it describes was built locally from the same
  Dockerfile.
- **The currently published Supervisor image does not work in this mode yet.** It reports
  `healthy: false` (`docker_gateway_unprotected`) because it tries to configure its firewall
  through systemd. `supervisor/supervisor/host/firewall.py` in this repository now honours
  `SUPERVISOR_FIREWALL_EXTERNAL=1`; the release that includes it publishes a Supervisor that
  works. While unhealthy, the Supervisor refuses installs, updates and backups. The checks
  above used an image built from that file on top of the published one.
- Only `amd64` ran. `arm64` is built by the workflow and untested; the machine name used for
  `arm64` is `qemuarm-64`.
- Apps that ask for host network access, privileged mode or devices are not blocked by this
  mode: they get the outer container's network and none of the computer's devices.
- Updating the Supervisor itself was not exercised, because no newer build existed.
- No app update was exercised, because none of the installed apps had a newer version.
- On a host with a different storage setup than Docker Desktop's, the inner `overlay2` engine
  may not start. The entrypoint prints the inner engine's log when it fails.
