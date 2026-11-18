# Hosting

How the product is hosted from the published container images.

| File | What it covers |
| --- | --- |
| [`full-mode.md`](full-mode.md) | The full hosting mode: one container with its own Docker engine, in which the Supervisor, the core and every app run, so the app store, apps, backups with apps and real updates work. What stays impossible, the privileged requirement, cost, start, stop, update, back up and going back. |
| [`usb-recovery.md`](usb-recovery.md) | Repairing or fully resetting a device from a USB stick labelled `HA-RECOVERY`, without opening the case: reinstall the operating system, reset the app storage, or erase everything. What it covers, what it cannot repair, how to prepare the stick by hand, the one-shot rule and the result file. Tested with pretend hardware only so far. |
| [`offline-update-pack.md`](offline-update-pack.md) | The offline update pack: one folder with a manifest and the update parts of a build, checked part by part and installed from a USB stick without internet. The format, the Supervisor route and install order, which parts install offline today (only the operating system), how the release builds packs, the Deploy Assistant stick maker, failure modes and what is verified. |
| [`cloud-host.md`](cloud-host.md) | The cloud host: reach the instance from outside through a tunnel, without a router port. The risks, setup with `host.bat --cloud` and in the full mode, the Supervisor API, failure modes, and what is verified. |
| [`release-recovery.md`](release-recovery.md) | Recover a release from the files preserved by its build. |
| [`release-build-wording.md`](release-build-wording.md) | The project's own English wording merged into the release build, and the rule that every commit carries a skip marker with one build dispatched per batch | Script proven against the real generator; workflow step not yet seen running |

The plain mode (core only, `compose.yaml`) is described in the main README.

There is no HTTP API of its own here, so there is no Postman collection for this category.
