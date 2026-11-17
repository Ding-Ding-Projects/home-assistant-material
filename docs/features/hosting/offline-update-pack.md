# Offline update pack

Status: implemented in the Supervisor, the release workflow and the Deploy Assistant. Tested with temporary folders standing in for a stick. It has not been tried with a real USB stick or on real hardware.

## What it is for

A device with no internet connection can already be updated from a single operating system update file on a USB stick (see [USB recovery](usb-recovery.md) for the related recovery stick). An offline update pack is the same idea for a whole build: one folder that carries a manifest and the update parts that belong together, so one stick can hold everything a build consists of, and every part is checked before anything on the device is touched.

## Pack format (version 1)

A pack is a folder named `ham-offline-pack-<build>` that holds `manifest.json` and the files it lists. The release attaches one ZIP per board, `ham-offline-pack-<build>-<board>.zip`, which contains that folder. The Deploy Assistant reads the ZIP directly; by hand, unpack it onto the stick.

```json
{
  "format": 1,
  "build": "123",
  "board": "rpi4-64",
  "parts": [
    { "kind": "supervisor", "available": false, "version": "2026.1.123" },
    { "kind": "core", "available": false, "version": "2026.11.1.123" },
    {
      "kind": "os",
      "available": true,
      "file": "haos_rpi4-64-17.0.123.raucb",
      "size": 412345678,
      "sha256": "<64 hex digits>",
      "version": "17.0.123",
      "board": "rpi4-64",
      "signature": "rauc-embedded"
    }
  ]
}
```

Rules, enforced by the Supervisor (`supervisor/supervisor/os/offline_pack.py`), the Deploy Assistant (`deploy-assistant/src/backend/usb-stick.js`) and the builder (`scripts/ci/make-offline-pack.py`) in the same way:

- `kind` is `supervisor`, `core` or `os`, each at most once. `available: false` means the part is not in the pack; such a part has no file.
- An available part has a plain `file` name (letters, digits, dot, dash, underscore; never a path, never `manifest.json`), a positive `size` and a lowercase hex `sha256`. A file may be listed only once.
- The `os` part is a Rauc bundle named `haos_<board>-<version>.raucb` for the pack's own board. Its `signature` is `rauc-embedded`: the bundle carries its own signature, which Rauc on the device checks when it installs. The pack adds no signature of its own and no signing key is involved in making one.
- The manifest is at most 256 KiB.

The pack folder sits on the stick in the root or in `updates`, `haos` or `home-assistant`, like a single update file.

## How the device installs a pack

The Supervisor lists a pack next to single update files (`GET /os/offline_update/candidates`, entries now carry `kind`: `bundle` or `pack`; a pack carries a `pack` summary of its manifest). Installing is never automatic. `POST /os/offline_update/pack` with the `drive_id` and the manifest `path` from the list starts a background job and returns its job id, like the single file route, with the same administrator-only access.

The job:

1. Re-lists the drives and accepts only the pack it listed, so a path that was not listed is refused. The pack must be for this board, newer than the installed or pending operating system version, and fit in free space.
2. Verifies the size and SHA-256 of **every** available part against the manifest while the stick is mounted read-only. Any mismatch, missing file or link refuses the whole pack, with the failing file named, before anything is copied or installed.
3. Copies the operating system part to local storage, computing its SHA-256 again during the copy and comparing it with the manifest, then releases the stick.
4. Goes through the parts in the fixed order Supervisor, Core, operating system, each step finishing before the next. The operating system part is handed to Rauc through the normal update service, which verifies its signature; a refusal is reported as the update file not being signed for this system or damaged. The device then needs a restart, as with any operating system update.

### What installs offline today

| Part | Offline | Why |
| --- | --- | --- |
| Operating system | Yes | The Supervisor already has a path that installs a Rauc bundle from a local file. |
| Supervisor | No: reported as `needs_network` | The Supervisor updates itself by pulling a container image through Docker. No code path installs it from a file, and none was invented. |
| Core | No: reported as `needs_network` | Same: Core updates pull an image. |

A part that is in the pack but cannot be installed offline is still verified, so a damaged pack is refused as a whole, and the job result lists it as `needs_network` with the reason. A part marked unavailable is reported as `skipped`.

## How the release builds packs

The release workflow has a final job, `pack`, that runs only after the publish job created the release, only for a manual run, and attaches one pack ZIP per board to that same release. It uses the operating system bundles the run already built and writes the manifest with `scripts/ci/make-offline-pack.py`. The Supervisor and Core images are pushed to the container registry by their own jobs and are not exported to files by this workflow, so in every pack those two parts are listed with `available: false`. No existing job was changed, and the workflow still runs no tests.

Making a pack by hand:

```
python scripts/ci/make-offline-pack.py --out packs --build 123 --board rpi4-64 \
    --os-bundle haos_rpi4-64-17.0.123.raucb --zip ham-offline-pack-123-rpi4-64.zip
```

Optional `--supervisor-image` and `--core-image` (with their `--*-version`) add those parts as files.

## Making a stick with the Deploy Assistant

The USB stick page has three steps. It never formats, repartitions, relabels or deletes anything.

1. **Purpose.** Offline updates, or recovery (reset apps, reinstall the operating system, factory reset).
2. **Choose the stick.** Only removable drives with a mounted volume are listed, with size, free space and label, through the platform's own read-only listing (PowerShell `Get-Disk`/`Get-Volume` on Windows, `lsblk` on Linux, `diskutil` on macOS). Then choose the pack (its ZIP or folder). The pack is checked part by part against its manifest at this point.
3. **Write and check.** The plan shows exactly which files will be added. Two separate controls are needed, nothing is typed: an "armed" switch that says the drive and its name were checked, and then the write button, which stays disabled until the switch is on. The files are then added next to what the stick holds (written under a temporary name, flushed, renamed), and afterwards **every file is read back from the stick and its SHA-256 compared** with the source.

What stops the write, with the exact reason shown: a stick format the device cannot read, too little free space, a file too large for FAT32, an `updates/<pack>` folder that already exists (existing files are never replaced), and for recovery a label other than exactly `HA-RECOVERY`. The app does not change a label: it says which manual step to take (the same steps as [USB recovery](usb-recovery.md)). A recovery stick that already carries a `recovery-request*` file is refused, because a recovery stick acts on one request only.

The recovery request is written with its confirm text generated from the chosen action, so nothing has to be typed on a stick.

## Failure modes

| Situation | Result |
| --- | --- |
| A part is missing, has the wrong size or checksum | The whole pack is refused and the file is named. Nothing is copied. |
| The stick is removed while the job copies | The copy fails, the local copy is deleted, nothing is installed. |
| The operating system part changes between the check and the copy | The copy's own checksum no longer matches and the pack is refused. |
| Rauc rejects the bundle | The job fails with "not signed for this system or damaged"; any previously pending update is dropped, as for a single file. |
| Another operating system update is running | The pack is refused until it finishes. |

## What was verified, and what was not

Verified:

- Manifest parsing and every refusal path, part verification, the pack scan and verdicts, the whole install job against a pretend Rauc and a temporary folder standing in for a stick, and the route's input checks: automated Supervisor tests in `supervisor/tests/os/test_offline_pack.py`, `test_offline_pack_install.py` and `supervisor/tests/api/test_os_offline_update_pack.py`.
- The pack builder, checked against the Supervisor's own manifest reader: `scripts/ci/test_make_offline_pack.py`.
- The stick maker's drive-list parsers, filtering, planning, refusals, copy and read-back, including a mismatch being reported, and ZIP unpacking: `deploy-assistant/test/usb-stick.test.js`, writing only into temporary folders.

Not verified:

- No real USB stick was used, and nothing was written to any real drive. The real drive listing commands were not run against a stick, and the macOS listing has not been run on a Mac at all.
- No real hardware installed a pack, and no real Rauc verified a real signed bundle from a pack.
- The release `pack` job has not run. It was only read back as valid YAML.
- The stick page was built into the window but not seen in a running window.
