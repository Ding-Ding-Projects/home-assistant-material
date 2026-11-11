# Minecraft server manager

Status: first slice built (definitions and target detection). Starting, stopping and managing servers is designed here but not built.

The manager lets a person create and run Minecraft servers from Settings. This document is the design and the record of what exists.

## The problem: this product usually runs in a container

Most installs run inside a container, and a container cannot start a sibling container by itself. The manager therefore offers five targets, listed in order of preference. The first available one is the default.

| Order | Target id | What it does | How it is detected | Needs |
| --- | --- | --- | --- | --- |
| 1 | `ssh_docker` | Signs in over SSH to a machine that has Docker and runs the server in a container there. | Always possible to define. | Host, user, and a key or password, asked when the server starts. |
| 2 | `supervisor` | The Home Assistant supervisor runs the server as a managed container. | The `hassio` component is loaded. | Home Assistant OS or Supervised install. |
| 3 | `docker_socket` | Uses the Docker engine of the host this app runs on. | `/var/run/docker.sock` exists and is readable and writable. | The person mounted the socket into this container on purpose. Opt-in. |
| 4 | `local_process` | Runs Java inside this container. | `java` is found on `PATH`. | Java installed here. |
| 5 | `ssh_process` | Runs Java directly on a remote machine over SSH. | Always possible to define. | A remote machine with Java and an SSH sign-in. |

The interface explains each target in plain words. The socket target shows a clear warning: mounting the Docker socket gives this app control of the whole host. The in-container process target warns that it shares memory with Home Assistant. A target that is not available stays visible with the reason, and cannot be selected.

## Data model

A server definition has these fields.

| Field | Rule |
| --- | --- |
| `id` | Generated, opaque. |
| `name` | 1 to 48 characters, letters, digits, spaces, dots, dashes and underscores, starting with a letter or digit. Unique, ignoring case. |
| `edition` | `java` or `bedrock`. |
| `flavour` | Java: `vanilla`, `paper`, `purpur`, `spigot`, `fabric`, `forge`, `neoforge`. Bedrock: `vanilla`. |
| `version` | `latest` or a version string of 1 to 40 characters from letters, digits, dots, dashes, plus signs and underscores. |
| `port` | Whole number from 1024 to 65535. Two servers cannot share a port on the same target. |
| `memory_mb` | Whole number from 512 to 65536. |
| `target` | One of the five target ids. |
| `state` | `defined` in this slice. Later: `stopped`, `starting`, `running`, `stopping`, `failed`. |

Later slices add world settings (difficulty, game mode, view distance, player limit, allow list) and per-target connection details. The validation rules live in `validation.py` on the server and are mirrored in `frontend/src/data/minecraft_manager.ts`; the server is the authority.

## Version discovery (designed, not built)

Version lists are fetched only when the person asks for them, never in the background.

- Java vanilla: Mojang's version manifest at `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`, which lists releases and snapshots and links to each version's metadata and server download.
- Paper: the PaperMC downloads API at `https://fill.papermc.io`, which lists versions and builds.
- Other flavours (Purpur, Fabric, Forge, NeoForge, Spigot) each have their own official source; each is added with its own source and its own failure handling.
- Bedrock: the official Bedrock server download page from Mojang. It has no stable machine-readable list, so this is decided when that slice is built.

Every download is checked against the hash the source publishes before it is used. Requests have timeouts and a size limit. A failed lookup leaves the typed version in place and says so.

## Storage

Definitions are kept in one private store, `minecraft_manager.servers`, written with the instance's normal storage mechanism. This slice stores definitions only. Later slices keep server data (worlds, plugins, backups) on the target, not in the Home Assistant configuration folder.

## Security

- SSH host keys use trust on first use. The fingerprint is shown to the person and must be confirmed. A changed key is refused until the person explicitly removes the old trust.
- SSH keys and passwords are kept with the instance's existing secret handling, are never written to logs, and are never sent back to the interface after they are saved.
- Commands for a target are built as argument lists, never by joining user input into a shell string. Names, versions and ports are validated before any command is built, and the version pattern rejects shell characters.
- The Docker socket target is opt-in. It is only offered when the socket is already mounted, and it is shown with a plain warning.
- Ports are published to the local network only. The feature never asks for, creates or suggests an internet-facing exposure.
- All commands require an administrator.
- Network lookups happen only on the person's request.

## Websocket commands

All commands require an administrator.

| Command | Purpose |
| --- | --- |
| `minecraft_manager/targets` | Reports each target with `available` and a stable `reason` code, by real detection. |
| `minecraft_manager/list` | Returns the stored definitions. |
| `minecraft_manager/create` | Validates and stores a definition. Returns `saved`, and a list of `{field, code}` errors when it is refused. |
| `minecraft_manager/update` | Validates and replaces a definition. |
| `minecraft_manager/delete` | Removes a definition. |

Later commands: version lookup, start, stop, restart, status, logs and console, backup and restore, and world generation.

## Pages

Settings, Minecraft servers (`/config/minecraft`):

- The server list with its empty state, a short summary, a state label per server and a delete action with confirmation. The Start action is shown disabled and labelled as coming in the next step.
- A create wizard with a step rail (Basics, Type and version, Where it runs, Review), live validation shown after a field is left, target cards with what each one needs and its warnings, and a live summary.

The board also shows tabs for Players, Plugins, World generator, Console and Backups, and a search over servers. Those are not built.

## Out of scope

- Hosting a server for the public internet, port forwarding, or any tunnel.
- Mod and plugin marketplaces beyond installing a file the person provides.
- Replacing the existing `minecraft_server` integration, which watches a server as a client. It is untouched.

## What cannot be verified here

- The pytest tests under `core/tests/components/minecraft_manager/` were written but could not be run in the authoring environment; only a Python syntax check passed.
- The pages were not opened in a browser. Type checks, lint and unit tests of the validation were run.
- No SSH, Docker, supervisor or Java target has been exercised, because this slice starts nothing.
- Version lookups, downloads and server start are not built, so none of their behaviour is verified.

## Next slice

1. Version discovery on request for Java vanilla and Paper, with hash checks.
2. The SSH Docker target: host and key setup with trust on first use, then create, start, stop and read logs of a server container.
3. Server detail page with a state, a start and stop action and a log view.
