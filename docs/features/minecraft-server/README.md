# Minecraft server manager

Status: second slice built. Server definitions, target detection, SSH hosts, version discovery, and the first real target, a Docker host over SSH (Java servers only). The other four targets are defined and detected but nothing starts on them yet.

The manager lets a person create and run Minecraft servers from Settings. This document is the design and the record of what exists.

## The problem: this product usually runs in a container

Most installs run inside a container, and a container cannot start a sibling container by itself. The manager therefore offers five targets, listed in order of preference. The first available one is the default.

| Order | Target id | What it does | How it is detected | Needs | State |
| --- | --- | --- | --- | --- | --- |
| 1 | `ssh_docker` | Signs in over SSH to a machine that has Docker and runs the server in a container there. | Always possible to define. | An SSH host with a key this instance generated. | Built (Java). |
| 2 | `supervisor` | The Home Assistant supervisor runs the server as a managed container. | The `hassio` component is loaded. | Home Assistant OS or Supervised install. | Not built. |
| 3 | `docker_socket` | Uses the Docker engine of the host this app runs on. | `/var/run/docker.sock` exists and is readable and writable. | The person mounted the socket on purpose. Opt-in. | Not built. |
| 4 | `local_process` | Runs Java inside this container. | `java` is found on `PATH`. | Java installed here. | Not built. |
| 5 | `ssh_process` | Runs Java directly on a remote machine over SSH. | Always possible to define. | A remote machine with Java. | Not built. |

A target that is not available stays visible with the reason and cannot be selected. A server on a target that cannot start yet can be saved; its page says it cannot be started here yet. Bedrock servers on the SSH Docker target are refused with a clear message, because the Java image does not run Bedrock.

## Data model

A server definition has these fields.

| Field | Rule |
| --- | --- |
| `id` | Generated, opaque. |
| `name` | 1 to 48 characters, letters, digits, spaces, dots, dashes and underscores, starting with a letter or digit. Unique, ignoring case. Two names that give the same container name are also treated as a duplicate. |
| `edition` | `java` or `bedrock`. |
| `flavour` | Java: `vanilla`, `paper`, `purpur`, `spigot`, `fabric`, `forge`, `neoforge`. Bedrock: `vanilla`. |
| `version` | `latest` or a version string of 1 to 40 characters from letters, digits, dots, dashes, plus signs and underscores. |
| `port` | Whole number from 1024 to 65535. Two servers cannot share a port on the same target. |
| `memory_mb` | Whole number from 512 to 65536. |
| `target` | One of the five target ids. |
| `host_id` | Optional. The SSH host that runs the server (the SSH Docker target). |
| `eula_accepted` | Set only by the person ticking "I accept the Minecraft EULA" on the server page. Starting is refused until it is true. |
| `state` | `defined`. The live state (`running`, `starting`, `stopped`, `absent`) is read from the host on request. |

The validation rules live in `validation.py` and `host_validation.py` on the server and are mirrored in `frontend/src/data/minecraft_manager.ts`; the server is the authority.

## SSH hosts

A host has a name, an address (host name or IP), a port, and a user. Authentication is by key only. There is no password path.

1. Creating a host makes an ed25519 key pair for it. The private key is written to `<config>/minecraft_manager/keys/<host id>.key` with permissions `0600` (the folder is `0700`), is never stored in the host record, never returned by any command, and never logged. The page shows the public key, a copy button, and the one line to add to `authorized_keys` on the host.
2. Host key trust on first use: the person presses "Read the host key", sees its SHA-256 fingerprint, compares it with what the host shows, and confirms. The key is read again on confirmation and stored only if it still matches the confirmed fingerprint.
3. Every later connection accepts only the stored key. A changed key is refused with `host_key_changed`. The person can replace the stored key with a deliberate, separate action that again shows the new fingerprint.
4. Changing a host's address or port drops its stored key, so trust is never carried to a different machine.
5. "Test connection" signs in and reports the Docker version and whether this user can run Docker.

The SSH library is `asyncssh`, which core already ships. OpenSSH config files, agents, passwords and keyboard-interactive sign-in are all disabled.

## Server container

- Image: `itzg/minecraft-server:2026.11.0-java21`, fixed in `const.py` and shown on the server page. Newer Minecraft releases that need a newer Java may need a different tag; change it in `const.py` when needed. The tag is never `latest`.
- Container name `mc-<slug of the name>`; data in the named volume `mc-<slug>-data` mounted at `/data`; label `minecraft_manager.server_id`.
- The game port is published on the host's local network address only: the address this instance reached the host at, and only if it is private, loopback or link-local. Otherwise starting is refused (`host_not_lan`). If the address this instance reaches is not an address of the host itself (for example through NAT), Docker refuses the bind and the person sees `bind_failed`.
- Memory: the game heap is the configured memory; the container limit adds a quarter (at least 512 MB) for the Java runtime.
- The EULA is passed to the container only after the person accepted it for that server.
- Changing a server's settings takes effect after the container is removed and started again; world data is kept in the volume.

Every remote command is an argument list quoted with `shlex.join`. Every value that reaches a command (name, version, port, memory, bind address, id, log line count) is validated again in `commands.py` before the command exists, so a hostile value raises an error and no command is built. Nothing from the browser is passed through as text. Error text from the remote side is never returned: failures are mapped to stable codes such as `docker_missing`, `docker_permission`, `port_in_use`.

## Operations

Start (checks the image, pulls it if missing, runs or starts the container, then checks the game port from this instance for up to 15 seconds), stop, restart, status, last N log lines (1 to 500, size capped, terminal codes removed), remove container (keeps the data; refused while running), and delete data (a separate action that requires the container to be gone and the server name typed back). Every command has a timeout. Commands for one server are serialized.

The status call opens a TCP connection to the game port from this instance and reports whether it answered. The server page shows the local network address, the port, and the full address to type into Minecraft, and says plainly when the check failed.

## Version discovery

Only when the person presses "Refresh versions", never in the background.

- Java vanilla: Mojang's version manifest at `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json` (releases and snapshots).
- Paper: `https://api.papermc.io/v2/projects/paper`.
- Fixed hosts over HTTPS, redirects are never followed, a 4 MB size cap and a 20 second timeout apply, every id is checked against the version pattern, and both lists are cached with the time they were fetched. If either lookup fails nothing is cached and the error code is shown.
- The wizard's version field is a typed field with a list below it, filtered by Releases, Snapshots or All and narrowed by what is typed. A typed version is always accepted. Other flavours have no list yet and say so.
- Downloads and hash checks of server jars are not done by this manager: the container image downloads the jar. Other flavours and Bedrock sources are still to do.

## Storage

Definitions are kept in `minecraft_manager.servers`, hosts and their trusted host keys in `minecraft_manager.hosts`, and the version cache in `minecraft_manager.versions`, all private stores. World data stays on the target, never in the configuration folder.

## Websocket commands

All commands require an administrator.

| Command | Purpose |
| --- | --- |
| `minecraft_manager/targets`, `list`, `create`, `update`, `delete` | Targets and definitions, as before. `create` and `update` also check `host_id`. |
| `minecraft_manager/hosts/list`, `create`, `update`, `delete` | Manage hosts. `create` returns the public key. `delete` is refused while a server uses the host. |
| `minecraft_manager/hosts/probe` | Read the host key and compare it with the stored one (`new`, `match`, `changed`). Stores nothing. |
| `minecraft_manager/hosts/trust` | Store the host key whose fingerprint was confirmed; replacing a different stored key needs `replace`. |
| `minecraft_manager/hosts/test` | Sign in and report the Docker version. |
| `minecraft_manager/versions/list`, `refresh` | Cached lists, and the fetch the person asked for. |
| `minecraft_manager/set_eula` | Record the EULA choice for a server. |
| `minecraft_manager/status`, `start`, `stop`, `restart`, `logs`, `remove_container`, `delete_data` | Operate a server. Results are `{ok: true, ...}` or `{ok: false, code}`. |

## Pages

Settings, Minecraft servers (`/config/minecraft`):

- The server list with open and delete actions, a link to SSH hosts, and an empty state.
- A create wizard (Basics, Type and version, Where it runs, Review) with live validation, the searchable version picker with its refresh button, target cards, and a Docker host choice for the SSH Docker target.
- SSH hosts: the list with trust state, and an add-host wizard (Details, Sign-in key, Host key, Test).
- A server page: state, start, stop and restart, the EULA tick, the address to join with a copy button and the reachability result, the live log (refreshes every few seconds while open, with pause and copy), and the remove actions.

The board also shows tabs for Players, Plugins, World generator, Console and Backups, a search over servers, and the Settings controls. Those are not built.

## Out of scope

- Hosting a server for the public internet, port forwarding, or any tunnel.
- Mod and plugin marketplaces beyond installing a file the person provides.
- Replacing the existing `minecraft_server` integration, which watches a server as a client. It is untouched.

## What was and was not verified

- Run: type checks, lint, formatting and the unit tests of the validation and version helpers in the interface; the Python files compile; and a real SSH round trip with the repository's own code against a throwaway `asyncssh` server (key sign-in, trust on first use, changed key refused, unknown key refused, start, status, logs, stop, remove, delete data, the private key never appearing in a result, key file modes). The Docker side of that round trip is a stand-in that answers the commands, so the real Docker behaviour, the pinned image and the `itzg` environment variables were not exercised.
- Tests written but not run in this environment: the tests that need the Home Assistant test fixtures (websocket commands and version fetching with a mocked HTTP client). The command, validation and SSH tests ran in a container without those fixtures.
- Not run: any real Docker host, the real Mojang and Paper services, and the pages in a browser.

## Next slice

1. Settings of a running server (difficulty, game mode, view distance, players), the Players, Console and Backups tabs.
2. Other flavours' version sources and the remaining targets (supervisor, Docker socket, local process, SSH process).
3. Bedrock on its own image.
