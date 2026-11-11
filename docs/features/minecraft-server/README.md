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

A host has a name, an address (a dotted decimal IPv4 address, a plain IPv6 literal or a real host name), a port, and a user. Authentication is by key only. There is no password path. Scoped addresses (`%`), hexadecimal and other numeric forms such as `0x7f.1`, and addresses that point at this machine or its own link (loopback, link-local, unspecified, and the name `localhost`) are refused when a host is created and again before a stored host is probed, trusted or tested. A host name that resolves to such an address is not detected.

1. Creating a host makes an ed25519 key pair for it. The private key is written to `<config>/minecraft_manager/keys/<host id>.key` with permissions `0600` (the folder is `0700`), is never stored in the host record, never returned by any command, and never logged. The private key lives in the configuration folder, so it is included in any backup of that folder; keep those backups private. If the folder cannot hold owner-only permissions (a mount where `chmod` does nothing) the key is removed again and creating the host fails with `key_permissions`; reading a key that cannot be tightened fails the same way. The record is saved after the key file is written, and the key file is removed again when the save fails. The page shows the public key, a copy button, and one command for the host: it creates `~/.ssh` with mode 700, adds the key on a new line of `authorized_keys` with the `restrict` option (no port or agent forwarding and no terminal, commands still run), and sets the file to mode 600. The page warns that an account allowed to run Docker is equal to root on that host, so use a dedicated user.
2. Host key trust on first use: the person presses "Read the host key", sees its SHA-256 fingerprint, compares it with what the host shows, and confirms. The key is read again on confirmation and stored only if it still matches the confirmed fingerprint.
3. Every later connection accepts only the stored key. A changed key is refused with `host_key_changed`; so is a host that now offers only a different key type than the trusted one (the failed key exchange is followed by a read of what the host offers). A stored key line that cannot be read fails with `host_key_invalid`. The probe shows the key type that was presented and names the matching `/etc/ssh/ssh_host_<type>_key.pub` file to compare with. The person can replace the stored key with a deliberate, separate action that names the host, shows both fingerprints, says what replacing means, and asks for confirmation.
4. Changing a host's address or port drops its stored key, so trust is never carried to a different machine.
5. "Test connection" signs in and reports the Docker version and whether this user can run Docker.
6. Deleting a host deletes its key pair here only. Nothing on the host changes, so the person must remove the line from `authorized_keys` on the host; the confirmation says so.

The SSH library is `asyncssh`, which core already ships. Both the connection and the host key probe pass `config=[]`, so the instance user's own `~/.ssh/config` is never read (no `Hostname` redirect, `ProxyCommand` or `ProxyJump`), and agent forwarding, X11 forwarding, environment sending and agents are off, as are passwords and keyboard-interactive sign-in. Remote output is read in 16 KiB chunks and the channel is closed when a stream reaches the cap, so a command that prints without end costs a bounded amount of memory; the log command is also cut on the host with `head -c 65536`.

## Server container

- Image: `itzg/minecraft-server:2026.11.0-java21`, fixed in `const.py` and shown on the server page. Newer Minecraft releases that need a newer Java may need a different tag; change it in `const.py` when needed. The tag is never `latest`.
- The tag pins the image; it is not a digest, and no digest is recorded.
- Container name `mc-<slug of the name>`; data in the named volume `mc-<slug>-data` mounted at `/data`. The container and the volume both carry the label `minecraft_manager.server_id=<server id>`. The volume is created first with `docker volume create --label`. Before any start, stop, restart, remove, status or data delete, the label is read (`docker inspect --type container`, `docker volume inspect`); an object whose label is missing or names another server is never adopted, stopped, removed or deleted, and the operation fails with `not_managed` ("not created by this manager"). A volume made without the label by an earlier build is treated the same way.
- The container is started with `--security-opt no-new-privileges`, `--pids-limit 1024`, and the `json-file` log driver limited to three files of 10 MB.
- The game port is published on the host's local network address only: the address this instance reached the host at, and only if it is a private, loopback or link-local unicast address. Unspecified, multicast, broadcast, reserved, documentation and benchmarking ranges and scoped addresses are refused both by the start operation (`host_not_lan`) and by the command builder itself. If the address this instance reaches is not an address of the host itself (for example through NAT), Docker refuses the bind and the person sees `bind_failed`.
- Memory: the game heap is the configured memory; the container limit adds a quarter (at least 512 MB) for the Java runtime.
- The EULA is passed to the container only after the person accepted it for that server.
- Changing a server's settings takes effect after the container is removed and started again; world data is kept in the volume.

Every remote command is an argument list quoted with `shlex.join`. Every value that reaches a command (name, version, port, memory, bind address, id, log line count) is validated again in `commands.py` before the command exists, so a hostile value raises an error and no command is built. Nothing from the browser is passed through as text. Error text from the remote side is never returned: failures are mapped to stable codes such as `docker_missing`, `docker_permission`, `port_in_use`.

## Operations

Start (checks the image, pulls it if missing, creates the labelled volume if needed, runs or starts the container, then checks the game port from this instance for up to 15 seconds), stop, restart, status, last N log lines (1 to 500, size capped, terminal codes removed), remove container (keeps the data; refused while running), and delete data (a separate action that requires the container to be gone, the volume label to match, and the server name typed back). A container state this manager does not know is `command_failed`, never "stopped". Every command has a timeout. Commands for one server are serialized.

Changing a server's name, host or target is refused while its container exists on the old host, or while that cannot be verified, so a running container is never orphaned. Deleting a definition is refused with `container_exists` while its container exists; when the host cannot be reached to check, the person is asked, and the delete can be repeated with `force`, which only skips an unreachable host.

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
| `minecraft_manager/targets`, `list`, `create`, `update`, `delete` | Targets and definitions. `create` and `update` also check `host_id`. `update` and `delete` hold the server's lock and check the container as described under Operations; `delete` answers `{ok: true}` or `{ok: false, code}` and takes an optional `force`. |
| `minecraft_manager/hosts/list`, `create`, `update`, `delete` | Manage hosts. `create` returns the public key. `delete` is refused while a server uses the host. |
| `minecraft_manager/hosts/probe` | Read the host key and compare it with the stored one (`new`, `match`, `changed`), with its algorithm and the matching key file type. Stores nothing. |
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

- Run: type checks, lint, formatting and the unit tests of the validation and version helpers in the interface; the Python files compile; and a real SSH round trip with the repository's own code against a throwaway `asyncssh` server (key sign-in, trust on first use, changed key refused, a host offering only another key type, a damaged stored key, unknown key refused, a user `~/.ssh/config` with a `Hostname` redirect ignored, never-ending output bounded, a one-line 5 MB log bounded, start, status, logs, stop, remove container, delete data, foreign containers and volumes left alone, the private key never appearing in a result). The Docker side of that round trip is a stand-in that answers the commands, including `rm` and `volume create`, `inspect` and `rm`, so the real Docker behaviour, the label templates, the pinned image and the `itzg` environment variables were not exercised.
- The websocket handlers (host trust flows, the rename, host change and delete refusals, the key permission failure) were driven directly with in-memory fakes of the websocket layer and storage, because the Home Assistant test harness could not be installed on the machine used. The tests in `test_websocket_flows.py` that use the real fixtures (each of the 22 commands refusing a non-administrator, and the same flows) were written but not run, and neither were the version-fetch tests with a mocked HTTP client.
- Not run: any real Docker host, the real Mojang and Paper services, and the pages in a browser.

## Next slice

1. Settings of a running server (difficulty, game mode, view distance, players), the Players, Console and Backups tabs.
2. Other flavours' version sources and the remaining targets (supervisor, Docker socket, local process, SSH process).
3. Bedrock on its own image.
