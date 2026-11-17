# Hosting

How the product is hosted from the published container images.

| File | What it covers |
| --- | --- |
| [`full-mode.md`](full-mode.md) | The full hosting mode: one container with its own Docker engine, in which the Supervisor, the core and every app run, so the app store, apps, backups with apps and real updates work. What stays impossible, the privileged requirement, cost, start, stop, update, back up and going back. |
| [`usb-recovery.md`](usb-recovery.md) | Repairing or fully resetting a device from a USB stick labelled `HA-RECOVERY`, without opening the case: reinstall the operating system, reset the app storage, or erase everything. What it covers, what it cannot repair, how to prepare the stick by hand, the one-shot rule and the result file. Tested with pretend hardware only so far. |
| [`release-recovery.md`](release-recovery.md) | Recover a release from the files preserved by its build. |

The plain mode (core only, `compose.yaml`) is described in the main README.

There is no HTTP API of its own here, so there is no Postman collection for this category.
