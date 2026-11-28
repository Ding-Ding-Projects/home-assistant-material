# Home Assistant Material add-on

Install this add-on from the dedicated catalog and choose **Open Web UI**. The
ingress panel lets a Supervisor administrator create a separate instance owner,
sign in, and inspect current entity states. Refresh reloads the list from the
nested instance. This viewer does not expose the entire native dashboard.

The add-on bundles the versioned Home Assistant Material image. Its settings
and accounts are in its own persistent `/data/material` directory. The nested
Core binds to loopback; the panel accepts traffic only from the Supervisor
ingress peer. No host ports, shared configuration mounts, Supervisor API,
Home Assistant API, Docker socket or privileged mode are required. Access
credentials stay in memory in the open panel. Opening a new panel requires
another sign-in. Keep a Supervisor backup before removing this add-on.
