# Hosting an independent instance from a backup

The backup hosting workflow creates a separate target and restores the uploaded Home Assistant backup through its first-run restore API. It does not restore over the source instance, edit automation configuration, or disable restored automations. Restored automations retain their original active state. Review the operational effect of running two copies before starting one.

## Targets and data

Docker and SSH targets create a uniquely named full-mode container and data volume, using the published `home-assistant-material-full` image so app backups are not silently reduced to Core configuration. VirtualBox and VMware use the existing appliance image provisioning paths. Raspberry Pi uses the existing verified-image writer only after a native confirmation names the re-enumerated removable drive. Card writing is followed by an explicit waiting-for-boot state, not a claim that hardware is ready.

The native file picker returns an opaque, expiring upload handle and display metadata. Renderer requests cannot supply filesystem paths. File bytes are streamed in the main process. Native `.tar` backups and ZIP wrappers containing exactly one `.tar` or `.tar.gz` backup are supported. Imports preserve an original copy, inventory archive names and types, reject traversal, links, duplicate tar entries, encrypted ZIP wrappers, ambiguous payloads and excessive sizes, and reserve local storage before copying. An encrypted Home Assistant backup remains encrypted until the destination restore API consumes the transient password.

Limits are 64 GiB of uploaded bytes, 10,000 tar entries, 1,000 ZIP entries and a maximum ZIP expansion ratio of 200 (with a 1 MiB small-file allowance). Backup metadata is limited to 1 MiB. These are application limits, not proof that every backup format or destination has been exercised.

Upload admission reserves capacity synchronously before streaming: at most two imports globally and one per client. Each reservation accounts for staging, an original copy and bounded extraction, with an aggregate 256 GiB reservation ceiling and 1 GiB free-space reserve. Capacity is released in `finally`. Failed imports remove only their application-owned partial copies. Expired imports without unfinished job references are reclaimed; the originally selected user file is never deleted. Active and incomplete jobs retain their import data for recovery.

Hosting work is limited to two active jobs globally and one per client, with at most 16 unfinished jobs globally and four per client. A client cannot create several unfinished jobs from the same upload using different request IDs. The journal retains at most 256 entries and refuses further admission rather than silently deleting recovery history. Queue passwords exist only in transient process memory; restarting requires entering them again.

## Native interface

All native calls return the existing `{ok,value}` or `{ok:false,error}` IPC envelope. The preload wrapper unwraps it for the renderer.

| Call | Input | Result |
| --- | --- | --- |
| `backupPick` | None | `null` or `{upload_handle,name,size,expires_at}` |
| `backupPiDrives` | None | Removable-drive metadata with expiring `drive_handle`, no device paths |
| `backupHostStart` | `{request_id,upload_handle,target,options,password?}` | Sanitized job |
| `backupHostJobs` | None | `{jobs:[...]}` for native-owned jobs |
| `backupHostCancel` | Job ID | Sanitized job; submitted restores cannot be cancelled |
| `hostBridgeStatus` | None | Bridge state, fingerprint, capabilities and available private bind addresses |
| `hostBridgeEnable` | `{address,port?}` | HTTPS bridge state, default port `48321` |
| `hostBridgePairApprove` | Pairing ID | Native approval dialog, then pairing summary |
| `sshHostKeyApprove` | Saved host ID | Unauthenticated key discovery, then native approval of that exact host, port and public-key fingerprint |

Options accept `name`, a saved `hostId`, `memoryMb` (2048–65536), `cpus` (1–32), `diskGb` (0–2048), and Pi `model` (`rpi3`, `rpi4`, `rpi5`). Native Pi requests may additionally carry the opaque `drive_handle`; it is resolved only in the main process and never accepted as a device path. Passwords remain transient and do not enter the job journal.

Pi discovery additionally accepts `pi_addresses`, an optional list of at most 16 explicit private IPv4 addresses. If omitted, discovery resolves only `homeassistant.local`, with a five-second DNS bound; it never scans a subnet. A name or responding address is insufficient: the newly prepared card must present the exact job-owned TLS certificate before any backup is transmitted. An existing waiting-for-boot job can retry with revised candidate addresses while retaining its identity and backup. Native job metadata includes `host_id` and the owner-bound opaque `upload_handle` so a reopened window can resume the correct record.

## Appliance bootstrap composition

The native composition reads `src/backend/backup-bootstrap-image.json`, whose only field is `image`, containing an immutable `ghcr.io/ding-ding-projects/...@sha256:...` reference. A missing, mutable or invalid descriptor produces a typed setup state and disables new VM preparation rather than selecting an unverified helper. Protected storage must actually be available. No helper descriptor is synthesized from a mutable tag.

The bootstrap service creates a private prepared VDI, VMDK or raw image from the verified cached base, with a job-owned certificate. VirtualBox and VMware attach only that prepared disk and wait for its exact TLS identity. The Pi writer receives the prepared raw image through its internal preparation callback after the separate native drive confirmation. Public certificate transport metadata is retained privately for resume; the private key stays in the protected bootstrap identity record and prepared appliance.

Completed preparation can resume only after the source hash, prepared-image hash, job identity and certificate fingerprint agree with the stored receipt. A partial or mismatched preparation is not silently overwritten. Child stdin errors are handled without echoing the private helper request. If restoring the backup replaces the appliance's TLS configuration, the client retains its original pin and reports unavailable verification; it does not downgrade to plaintext transport.

Jobs expose `id`, `request_id`, `state`, `phase`, `target`, `instance_id`, `lan_url`, `error_code` and `updated_at`. Unknown readiness, unavailable setup, missing hardware and authentication requirements remain explicit states. A visible URL alone is not a completed restore.

A sign-in link is exposed separately when `lan_url_verified` is true and `lan_url_verified_at` records a successful bounded check of the actual private IPv4 endpoint and Home Assistant manifest. `authentication_needed` remains incomplete even when that link is verified. Cancellation during provisioning stays `cancelling` until the current operation settles and its owned resource is reconciled; it does not claim terminal cancellation while a later provisioning action can still begin.

## Core-to-host HTTPS bridge

The native assistant runs a private-LAN HTTPS bridge because a nested Core container cannot operate the desktop host's container or virtual-machine APIs. The bridge binds only to an explicitly chosen private IPv4 address. It accepts no browser `Origin` or fetch-metadata request and provides no CORS permission.

The certificate is generated with `selfsigned@4.0.1`, SHA-256 and a 2048-bit key. Certificate private material and paired-client authority are stored only through available operating-system protected storage; a plaintext storage backend is rejected. Core pins the native-confirmed certificate fingerprint and stores its own pairing credential privately.

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /v1/status` | Public | Only neutral protocol version, pairing-required state and certificate fingerprint |
| `GET /v1/status` | Paired | Bridge state and capabilities |
| `GET /v1/capabilities` | Paired | Supported target identifiers, archive formats and limits |
| `POST /v1/pair` | Challenge | `{core_instance_id,client_id,challenge}` creates a ten-minute pending native approval |
| `GET /v1/pair/:id` | `X-Pairing-Challenge` | Pending state or a once-only credential after native approval |
| `POST /v1/uploads` | Paired | Bounded binary stream with `Content-Length`, `Content-Type` and optional safe ASCII `X-Upload-Name` |
| `POST /v1/jobs` | Paired | Create or reconcile a request using its stable `request_id` |
| `GET /v1/jobs` | Paired | Only that client's jobs |
| `GET /v1/jobs/:id` | Paired | Only that client's matching job |
| `POST /v1/jobs/:id/cancel` | Paired | Cancel before restore submission without deleting provisioned data |

Authenticated requests carry `Authorization: Bearer <credential>`, `X-Core-Instance` and `X-Client-Id`; both identities must match the approved binding. Each upload and job belongs to that binding. The credential is never returned by a status or job route. Pairing capacity is bounded, expired challenges are removed, and resolving a pairing twice is rejected.

## Restore and recovery

The coordinator checks `GET /api/onboarding/backup/info`, streams a multipart upload to `POST /api/onboarding/backup/upload?agent_id=hassio.local`, then submits JSON to `POST /api/onboarding/backup/restore`. It restores Core and the database and leaves app and folder selections to the official full-restore default. It never passes an official backup to the old target-specific snapshot/configuration restore methods.

The private job journal records resource ownership before provisioning, the uploaded backup ID before restore and `restore_submitted` before transmission. Retrying an existing request reuses its identity. A restart marks unfinished work as needing resume; known owned resources are reconciled rather than created again. An uncertain provisioning or restore boundary stops for reconciliation instead of duplicating a destructive action. Original backup copies and provisioned data are retained on cancellation.

Ordinary deployments and backup jobs share one allocation mutex. Port selection, collision checks and persistence are serialized before provisioning begins, including local Docker and VirtualBox ports on the same computer. An explicitly chosen conflicting port produces `port_in_use`; it is not silently replaced. Abort state is checked after each asynchronous prerequisite and immediately before provisioning.

SSH hosts require approval of their exact host/port/public-key binding before authentication. Discovery offers no password, private key or agent. Every later connection verifies the saved SHA-256 pin, and a missing or changed key pauses the job for explicit native approval. SSH backup restoration uses a host-key-verified tunnel to the owned instance's loopback-published port. Archive bytes and restore passwords never travel over plaintext LAN HTTP. VirtualBox backup instances provide a TLS loopback forward for restoration and a separate TLS private-LAN forward for access. Other non-loopback restore endpoints require HTTPS with an explicitly verified certificate fingerprint and normal TLS chain/identity validation; there is no certificate-verification bypass or plaintext fallback.

Typed destination outcomes include `incorrect_password`, `backup_version_too_new`, `backup_no_core_archive`, `restore_failed` and `authentication_needed`. Readiness requires restore completion evidence plus a successful check of the actual LAN endpoint. If restored authentication closes the first-run API before completion can be observed, the job returns `authentication_needed` and the checked LAN URL, not `ready`.

## Verification state

Meaningful unit tests cover path validation, original-byte preservation, unsupported archives, official restore request shape, uncertain-submission replay prevention, password handling, protected-storage availability, durable idempotency, full-mode isolation, aggregate capacity, incomplete-upload retention, shared allocation, cancellation races, SSH key verification and truthful sign-in link metadata. They were authored with this change but have not yet been run. No container, virtual machine or physical drive was created by the implementation session. Native pairing, all target provisioning, actual encrypted restores, restart reconciliation and LAN readiness require built-runtime acceptance before delivery can be claimed.
