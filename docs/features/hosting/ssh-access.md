# SSH access

Settings > System > SSH access lets an owner or administrator paste a public key so that a trusted computer can sign in over SSH. Sign in is by key only; there is no password login. The page shows whether SSH is on, how to connect (with a copy button), the keys that can sign in with their fingerprints, a field that checks a pasted line before anything is saved, and a way to remove one key or all of them.

## Using it

1. On the computer that will connect, run `ssh-keygen -t ed25519`.
2. Open the file that ends in `.pub` and paste its one line under **Add a public key**. The page shows the key type, name and fingerprint before you press **Add key**.
3. Connect with the command shown on the page: `ssh root@<address> -p 22222`. The private key never leaves that computer.

What the field refuses, before anything is sent:

- a **private key**: the field is cleared at once and a red message says to paste the `.pub` file instead;
- more than one line, a line that is not a key, a line over 3000 bytes, and a key that is already on the list.

The "not a key" message waits until you leave the field, press **Add key**, or the line can no longer become a key, so it does not shout while you type.

Removing one key, or all of them, asks first, inline in the row, and keyboard focus follows. Removing the last key turns SSH off. Adding the first key turns it on. The page is for owners and administrators only.

## Two backends, one page

| | Home Assistant OS | Full Docker hosting mode |
| --- | --- | --- |
| Where keys live | OS Agent, root's `authorized_keys` on the host | `/data/ssh/authorized_keys` in the Supervisor, which is `${SUPERVISOR_DATA}/ssh/authorized_keys` in the outer container |
| SSH server | `dropbear.service` of the operating system | dropbear in the outer image, started by `hosting/full/entrypoint.sh` |
| Port | 22222 | 22222 inside; published as `${HA_MATERIAL_SSH_PORT:-22222}` by `compose.full.yaml` |
| Passwords | off | off (`dropbear -s -g`) |
| Host key | the operating system's | kept on the data volume (`ssh_host_ed25519_key`), so clients do not see it change on a restart |
| What you get | a shell on the host | a shell in the outer container, next to its Docker engine |

The Supervisor picks the backend itself: with `SUPERVISOR_CONTAINER_HOST=1` it uses the file, otherwise OS Agent. The page is identical in both. The list endpoint also answers with a `mode` of `os` or `container`, which the page uses to show the Docker note.

On a plain install (core only, no Supervisor) or an operating system with an OS Agent older than 1.11.0 the list answers 404 and the page says SSH access is not available here.

## Supervisor API

Core-only access (the Core reaches it through the `supervisor/api` websocket command as an administrator).

| Method and path | Does |
| --- | --- |
| `GET /os/ssh/authorized_keys` | `{"keys": [...], "mode": "os" or "container"}` |
| `POST /os/ssh/authorized_keys` | Add one key, `{"key": "ssh-ed25519 AAAA... name"}`. In the full mode the Supervisor checks the key itself (a recognised public key type, one line, no control characters, under 3000 bytes) and adding a key already listed changes nothing. |
| `DELETE /os/ssh/authorized_keys/{fingerprint}` | Remove the key with that SHA256 fingerprint. The fingerprint may carry the `SHA256:` prefix and may use the URL-safe alphabet (`-` and `_` for `+` and `/`), which the page does so it fits in a path. 404 when no key matches. |
| `DELETE /os/ssh/authorized_keys` | Remove every key. |

On the operating system OS Agent can only append and clear, so removing one key reads the list, filters it, clears and writes the rest back as one queued job. If writing back fails, the original list is written back. The SSH service is then stopped (which ends established sessions, so a removed key cannot keep a session open) and started again if keys remain.

In the full mode writes go through a temporary file in the same folder and an atomic rename; the folder is mode 700 and the file mode 600, which is what dropbear requires before it trusts the file.

## Fingerprints

The page works out each key's SHA256 fingerprint in the browser from the base64 key body with SubtleCrypto, in the form OpenSSH prints (`SHA256:` and unpadded base64). The Supervisor computes the same value to find the key to remove.

## Security

- Keys only, no password. Keep the port inside your home network and do not forward it on your router; the page says so.
- Only owners and administrators can open the page, and the endpoints are not reachable by apps.
- The page never keeps a private key: a pasted private key is dropped from the field before anything else happens.
- In the full mode, removing one key stops new sign-ins with it at once but does not end a session that is already open; removing all keys does not either. Restart the container to end open sessions.

## Verified

- Supervisor: unit tests for the key parser, the file backend and the API in both backends (add, list, remove one, remove all, unknown fingerprint, restore after a failed write back, container mode checks); 367 passed in a throwaway container with the existing OS API, security-middleware and OS manager tests.
- Frontend: tests for the key parser, the RSA bit length, the fingerprints (the values OpenSSH prints) and the input checks.
- dropbear with these options was run in a throwaway container: no key gives "Permission denied (publickey)", a key in the file signs in, and a password login is refused.

Not verified: the page in a browser on a running instance, the full mode image rebuilt and started with the new entrypoint, and an operating system image with a real OS Agent.
