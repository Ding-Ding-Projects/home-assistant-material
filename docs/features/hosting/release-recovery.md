# Recover a release from build artifacts

## A scoped manual Core update

An update to the running Core can be delivered separately from appliance images.
Build an immutable source export through `build.bat /s`, with a reserved numeric
`HA_BUILD_NUMBER` and the exact `HA_BUILD_SOURCE` revision. The entrypoint stamps
the Core version and image revision, and its image marker contains no workstation
identity. The default local build remains unnumbered.
Set `HA_BUILD_MACHINE` to a machine listed for the current processor in
`versions.json` to produce `home-assistant-material:machine-local` through its
existing machine wrapper. Unsupported machine names stop before compilation.

For that update, publish only the verified machine image and ready frontend wheel,
with a normal release, source revision, file hashes and an explicit machine/language
inventory. Preserve Supervisor, other-machine and appliance feed entries that were
not built. Advance only the intended machine's Core entry after release readback.
Do not imply that an x86-64 update builds or verifies ARM or appliance images.

Automatic source pushes retain build outputs; the full workflow publishes only
when explicitly dispatched. Coordinate tags before either manual route so an
update has one immutable release. Never overwrite an existing tag or image.

Open the exact **Release** workflow run and find **Artifacts**. The frontend wheel,
operating system images and checksums, and Deploy Assistant files are uploaded by
their build jobs before the publisher runs. New runs retain them for 14 days.
The **publication-recovery** artifact for the run attempt records the source,
intended release tag, job status, and release notes and file list when available.
Download the build files from their respective artifacts.
The publisher can use a repository or organization release credential configured
in GitHub Actions. The default workflow credential can publish from the current
default-branch source. A historical source with different workflow files may need
a credential with workflow write access.

If the build jobs succeed and automatic publication fails, download the artifacts
from that run using `gh run download <run-id>`. Verify the board checksums,
expected asset names and sizes, and the exact source revision of the published
container images. Publish the missing release with the intended tag and source
using an authorized account. Read back the release and all its files before moving
the update feed. Keep the previous operating system feed entries unless every
board confirms it used the persistent signing key.

These downloads contain build outputs. Back up an existing Home Assistant
installation through the Supervisor before updating it.
