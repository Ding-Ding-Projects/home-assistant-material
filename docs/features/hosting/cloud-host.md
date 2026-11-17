# Cloud host

The cloud host makes this instance reachable from outside the home network through a tunnel, with
no port opened on the router. A small tunnel client inside the hosting setup makes an outbound
connection to the tunnel provider, and the provider forwards requests for a hostname you own to
the instance.

## Read this first: the risks

- **The instance becomes reachable from the internet.** Anyone who knows the hostname can reach the
  sign-in page. Use a long, unique password and turn on two-step sign-in for every account before
  you start.
- The provider carries all traffic to the instance and can see it. Choose a provider you trust.
- The tunnel credential gives control of the tunnel. Keep it out of files that are shared, tracked
  or backed up in the clear. If it leaks, delete the tunnel in the provider account and set up a
  new one.
- Pausing or removing the cloud host closes the outside route at once. Local access is not changed.

## Core settings that must be present

Home Assistant refuses requests that arrive through a proxy unless it is told to trust the proxy.
Add this to `configuration.yaml` and restart:

```yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - <tunnel container address> # the address of the tunnel container only, never a whole range
```

Use the address of the tunnel container on the compose network. `host.bat --cloud` and
`./host.sh --cloud` print it after starting. Without these lines the instance answers requests
from the tunnel with an error. A new default configuration does not contain them, and this
feature does not edit a configuration file for you.

## Setup in the plain mode (compose)

1. In the provider account, create a tunnel and copy its credential (a token).
2. In the tunnel settings, add a public hostname such as `ha.example.com` and point it at
   `http://homeassistant:8123` (the service name on the compose network).
3. Put the credential in the environment variable `HA_MATERIAL_TUNNEL_TOKEN`, either in your own
   shell environment or in an untracked `.env` file next to `compose.yaml`
   (`HA_MATERIAL_TUNNEL_TOKEN=...`). Never put it in a tracked file.
4. Start with the flag:

   ```
   host.bat --cloud --detached        (Windows)
   ./host.sh --cloud --detached       (Linux, macOS)
   ```

   Without `--cloud` nothing changes. With `--cloud` and an empty variable the script stops with
   a clear message before it starts anything. `--cloud` is not available with `--full`.
5. Add the core settings above, restart, and open the hostname.

The tunnel is the `cloud-tunnel` service in `compose.yaml` under the `cloud` profile. It uses the
official tunnel image at a pinned version, publishes no ports, restarts unless stopped, and has a
health check. `host.bat --stop --cloud` stops it with the rest.

## Setup in the full mode (Supervisor)

The full mode manages the tunnel from the Supervisor through the API below, and the interface
drives it from Settings. The person enters a hostname, the Supervisor starts the tunnel client's
sign-in and returns only the sign-in address the client prints. After signing in at the provider,
the client holds its credential in its own data volume. The credential is never returned by the
API, written to the logs or placed in backup metadata.

## API

All routes are on the Supervisor API. Only `GET /cloud_host/info` is readable by apps with the
default role; every other route needs the administrator role. Errors use the Supervisor's usual
envelope (`{"result": "error", "message": ...}`).

| Method and path | Purpose |
| --- | --- |
| `GET /cloud_host/info` | The current state. |
| `GET /cloud_host/sign_in` | The pending sign-in address, or `null`. Administrator only. |
| `POST /cloud_host/setup` | Body `{"hostname": "ha.example.com"}`. Starts the sign-in. |
| `POST /cloud_host/pause` | Stop serving, keep the sign-in. Only while running. |
| `POST /cloud_host/resume` | Serve again after a pause, or retry after an error. |
| `POST /cloud_host/remove` | Stop, delete the credential, forget the hostname. |
| `POST /cloud_host/check` | One HTTPS request to `https://<hostname>/manifest.json`, with a 10 second timeout and no redirects. Records only the status and the time. |

State values: `not_set_up`, `waiting_for_sign_in`, `running`, `paused`, `error`.

`GET /cloud_host/info` and every state-changing route answer with:

```json
{
  "result": "ok",
  "data": {
    "state": "running",
    "hostname": "ha.example.com",
    "error": null,
    "last_check": {
      "time": "2026-11-17T12:00:00+00:00",
      "ok": true,
      "status": 200,
      "reason": null
    }
  }
}
```

- `hostname` and `last_check` are `null` until they exist. `error` holds a short reason only when
  the state is `error`.
- `last_check.reason` is the name of the failure (for example `TimeoutError`) when the hostname did
  not answer, and `status` is then `null`. `ok` is true only for status 200.
- `POST /cloud_host/setup` also returns `"sign_in_url"` (a string, or `null` when the setup failed).
  `GET /cloud_host/sign_in` returns `{"result": "ok", "data": {"sign_in_url": "https://..." }}`
  while the state is `waiting_for_sign_in`, otherwise `null`.
- Hostnames must be plain DNS names: letters, digits and hyphens in labels separated by dots, at
  least two labels, the last starting with a letter. IP addresses, ports, paths, schemes and
  single-label names are refused with status 400.
- An action that does not fit the state (setup twice, pause when not running, check before setup)
  answers with status 409.

## Failure modes

| What happens | What it looks like | What to do |
| --- | --- | --- |
| Tunnel client missing in the full mode | State `error`, reason `tunnel runner not installed` | Not wired up yet, see below. |
| Sign-in never completed | State stays `waiting_for_sign_in` | Open the sign-in address again, or remove and set up again. |
| Tunnel client stopped | State `error`, reason `tunnel is not running` | Resume. |
| Hostname does not answer | `last_check.ok` false, `status` null | Check DNS and the provider hostname route. |
| Answers 502, 400 | `last_check.status` is that number | Check the core `http:` settings and that the provider points at the right service and port. |
| Removal failed | State `error`, hostname kept | Run remove again. |

## What was verified and what was not

Verified:

- The Supervisor module and routes, against a fake tunnel runner, with automated tests
  (state machine, hostname validation, persistence, no credential in stored state, check result).
- The flag handling of `host.bat` and `host.sh`: an empty credential variable stops with the
  message, `--cloud` with `--full` is refused.

Not verified:

- No tunnel was started and no provider was contacted. The compose service has not been run.
- The real tunnel runner for the full mode is not wired up: it is a placeholder that reports
  `tunnel runner not installed`. Starting the tunnel client from the Supervisor needs an app or
  container mechanism that is still to be done.
- The core `http:` settings are documented here but not added to the default configuration
  template, which lives in the core part of the tree.
