# Secure first-boot restore for new appliances

The Deploy Assistant can prepare a private, per-job copy of a released operating-system image before creating a VMware virtual machine or writing selected Raspberry Pi media. Preparation does not modify the public download, an existing installation, the signed boot partitions, the kernel, or the root filesystem. It does not pause automations or alter their restored active state.

## Image ownership and preparation

`BootstrapImageService` accepts only a release-image downloader record under its configured cache directory. It rehashes the image against the downloader's local verified SHA-256 record before and after preparation. The service creates an exclusive job directory beneath a dedicated private bootstrap root, generates a unique TLS identity, and stores the host copy of its private key only through native encrypted storage. A plaintext storage backend is not accepted.

The offline helper runs with networking disabled, no Linux capabilities, a read-only root filesystem, a small temporary filesystem, and only the verified input file and private job output directory mounted. Its image reference must contain an immutable SHA-256 digest. Runtime input travels on standard input, never in build arguments, image layers, process arguments, logs, or releases. The prepared disk itself necessarily contains its own TLS private key and must remain private.

The helper extracts one disk from the released OVA, VDI ZIP, or compressed raw image. User-space `qemu-img` converts only this owned copy. The GPT parser validates header and entry CRCs, partition bounds, overlap, the `hassos-data` partition, and its ext4 label. `debugfs` seeds only the fresh data filesystem. Existing Home Assistant configuration, Supervisor Home Assistant state, or a backup directory causes rejection. No host block device or kernel filesystem mount is used.

## First boot and restore transport

HAOS mounts `hassos-data` at `/mnt/data`; its checked-in `haos-supervisor` script gives Supervisor `/mnt/data/supervisor`. Supervisor's [configuration paths](https://github.com/home-assistant/supervisor/blob/main/supervisor/config.py) and [Core mounts](https://github.com/home-assistant/supervisor/blob/main/supervisor/docker/homeassistant.py) place `supervisor/homeassistant` at Core's `/config`.

Preparation creates a minimal `configuration.yaml` with HTTPS on port 8123 and the job certificate and key under `/config/.backup-bootstrap`. It retains normal authentication and onboarding. Fresh images may initially run the preparation interface while Supervisor installs Core. An HTTP answer from that interface is not identity proof and never authorizes backup or password transmission. Native discovery waits for normal certificate-chain and hostname verification plus the exact per-job SHA-256 certificate fingerprint. Only then may the restore client upload the archive over HTTPS.

VMware uses the new private VMDK in the imported machine's single boot-disk slot and validates the certificate at the address reported for that machine. Raspberry Pi discovery accepts at most sixteen explicitly supplied local addresses and waits a bounded interval. Neither `homeassistant.local` nor an arbitrary HTTP response identifies the job-owned device. Certificate possession proves the prepared media or guest identity, not a physical board serial number.

## Restored configuration and honest readiness

A complete restore may replace configuration and TLS files with the backup's original configuration. The original authentication and automation states remain authoritative. A changed certificate or unavailable endpoint after restore is not permission to disable certificate validation or resend protected data over HTTP. The native job must retain a pending readiness or authentication state until the restored workspace is independently verified. Upload acceptance and a usable restored workspace are separate results.

## Build and verification state

The root build must build and publish `hosting/backup-bootstrap` using a reviewed immutable Alpine base reference and exact package-version arguments `PYTHON_VERSION`, `QEMU_VERSION`, and `E2FSPROGS_VERSION`. No default mutable helper reference is accepted. Supply the resulting digest reference to `BootstrapImageService`; its private runtime input is never part of the build context.

Focused source tests cover invalid identities, unavailable encrypted storage, digest-only helper selection, filesystem containment and discovery bounds. They have been authored for the final verification pass. Real helper builds, image preparation, first boot, HTTPS identity, restore, active automation state, VMware and Raspberry Pi hardware behavior remain unverified until exercised through the supported root entrypoints and actual native runtime. This source document does not claim delivery of those results.
