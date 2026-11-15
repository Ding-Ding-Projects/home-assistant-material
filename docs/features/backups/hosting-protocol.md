# Independent backup hosting protocol

The backup interface can request a new independent container or Linux appliance on the computer running Deploy Assistant. It does not restore into, stop, or change the original Home Assistant instance. Restored automations keep their original active state. Users should consider the effects of running a second active instance against the same devices before starting it.

## Pair this computer

Enable the HTTPS host bridge in Deploy Assistant and copy its URL and SHA-256 certificate fingerprint into the backup hosting dialog. Core generates an independent client identifier and a cryptographically random challenge. Approve the exact requesting instance, client and certificate in the native assistant. The challenge expires after ten minutes and exists only in Core memory. Restarting Core requires a fresh pairing request.

Core accepts HTTPS with an explicit port from 1024 through 65535 on `localhost`, loopback IP addresses, `host.docker.internal`, or `gateway.docker.internal`. Arbitrary LAN hosts, URL credentials, paths, queries and fragments are rejected. Requests pin the complete certificate fingerprint, do not follow redirects, do not use environment proxies, do not accept cookies, and never send a browser Origin. This is a physical-host bridge, not a general network request proxy.

After native approval, only Core receives the once-only credential. It stores the credential in the private `.storage/backup.hosting` store. Neither WebSocket responses nor entity state contain the credential. The store also holds a distinct hosting instance identity. Both Core and Supervisor exclude that exact file from configuration backups, while normal authentication, configuration, history and automations remain included. A newly restored instance consequently has no source-host pairing authority and must pair independently.

## Administrator WebSocket commands

Every command requires an authenticated administrator. The ordinary WebSocket `id` field accompanies the fields below.

| Command | Request fields | Result |
| --- | --- | --- |
| `backup/hosting/status` | None | `{bridges: [{id, url, paired, capabilities?, error_code?}]}` |
| `backup/hosting/pair` | `url`, `fingerprint` | `{bridge_id, state: "pending_native_approval", pairing_id}` |
| `backup/hosting/pair` | `bridge_id` | Pending result or `{bridge_id, state: "paired"}` |
| `backup/hosting/start` | `request_id`, `backup_id`, `agent_id`, `bridge_id`, `target`, optional `options: {name}`, optional `password` | Immediate upload job |
| `backup/hosting/jobs` | `bridge_id` | `{jobs: [...]}` |
| `backup/hosting/cancel` | `bridge_id`, `job_id` | Job or typed error |

Targets are `docker`, `virtualbox`, or `vmware`. Authenticated bridge status returns `capabilities.targets` for protocol support and `capabilities.target_status[target].available` for checked local availability. A false or absent availability verdict never enables provisioning. Availability can change after the check; the native provisioning step must still validate its runtime. The browser resolves the appliance action against actual available hypervisors and asks for a choice when appropriate. It never silently substitutes a container for an appliance.

Jobs expose only `id`, `request_id`, `state`, `phase`, `target`, `instance_id`, `error_code`, `updated_at`, and a verified `lan_url` when ready. Core adds the selected `backup_id` and `agent_id` from its request journal. Native response bodies, filesystem paths, exception text, passwords, credentials and arbitrary option fields are never forwarded. A LAN URL must use an ordinary HTTP or HTTPS private IP address, without credentials, query values or fragments. Loopback and unspecified addresses are not a reachable-LAN result.

## Transfer, progress and cancellation

Core resolves the selected backup through its authorized backup agent, checks its metadata, and streams the original protected archive directly to the approved bridge. The browser never buffers archive bytes and cannot supply a filesystem path. Missing agents, deletion races, missing decryption keys, unavailable runtimes and changed archive lengths produce typed errors. Protected archives require the supplied decryption password, which is forwarded only in the authenticated job request and is never persisted in the request journal.

The archive limit is 64 GiB. Uploads send a declared content length and abort if the stream is shorter or longer. Responses are bounded to 256 KiB, native job lists to 1000 entries, and Core permits at most two simultaneous transfer tasks. Connections have a ten-second connect limit, a sixty-second read limit, and a one-hour total upload limit. Non-upload calls have a thirty-second total limit. Native archive parsing separately enforces extraction and file-count limits.

Start returns an upload job immediately. Poll `jobs` for progress and reconnect recovery. Cancellation during transfer closes the stream; cancellation after native submission goes through the native owned-job endpoint. An uncertain submission cannot truthfully be reported as cancelled and remains `reconciliation_needed` until native state can be read.

## Idempotency and recovery

The request journal is saved before transfer begins. A `request_id` is bound to the same bridge, backup, agent and target. Reusing it for different input is rejected. Reconnecting lists native jobs by that identifier and does not replay provisioning or restoration. A disconnected or interrupted upload is retained as an explicit incomplete record; starting a new attempt requires a new request identifier after examining the prior state.

There is one deliberate retry exception: if the native job reports `incorrect_password`, an explicit new password with the same identity can resubmit the same request and already uploaded handle. The native host resumes that existing restore instead of provisioning another instance. The password remains transient. No automatic reconnect path performs this retry.

Core retains at most 1000 request journal entries. A full journal returns `request_journal_full`; it does not silently delete recovery records. Completed instance lifecycle management and journal retirement are separate work.

## Verification state

The implementation includes focused tests for endpoint restrictions, certificate pin format, response sanitization, stream length mismatch, pairing expiry and credential containment, request identity conflicts, reconnect reconciliation, protected-backup handling, and real Core archive exclusion. The existing Supervisor archive exclusion test is extended to cover the hosting store while retaining ordinary identity and authentication stores. These tests have been added but have not yet been run in this implementation lane. Native pairing, actual backup transfer, provisioning, restoration, cancellation and LAN reachability require end-to-end verification with the built components before delivery can be claimed.
