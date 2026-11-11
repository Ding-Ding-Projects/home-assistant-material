# Hosting

How the product is hosted from the published container images.

| File | What it covers |
| --- | --- |
| [`full-mode.md`](full-mode.md) | The full hosting mode: one container with its own Docker engine, in which the Supervisor, the core and every app run, so the app store, apps, backups with apps and real updates work. What stays impossible, the privileged requirement, cost, start, stop, update, back up and going back. |

The plain mode (core only, `compose.yaml`) is described in the main README.

There is no HTTP API of its own here, so there is no Postman collection for this category.
