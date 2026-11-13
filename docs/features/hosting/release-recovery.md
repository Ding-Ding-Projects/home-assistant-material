# Recover a release from build artifacts

Open the exact **Release** workflow run and find **Artifacts**. The frontend wheel,
operating system images and checksums, and Deploy Assistant files are uploaded by
their build jobs before the publisher runs. New runs retain them for 14 days.
The **publication-recovery** artifact for the run attempt records the source,
intended release tag, job status, and release notes and file list when available.
Download the build files from their respective artifacts.

If the build jobs succeed and automatic publication fails, download the artifacts
from that run using `gh run download <run-id>`. Verify the board checksums,
expected asset names and sizes, and the exact source revision of the published
container images. Publish the missing release with the intended tag and source
using an authorized account. Read back the release and all its files before moving
the update feed. Keep the previous operating system feed entries unless every
board confirms it used the persistent signing key.

These downloads contain build outputs. Back up an existing Home Assistant
installation through the Supervisor before updating it.
