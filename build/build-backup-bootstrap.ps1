$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
try {
    $lock = Get-Content hosting/backup-bootstrap/build-lock.json -Raw | ConvertFrom-Json
    if ($lock.baseImage -notmatch '^docker\.io/library/alpine@sha256:[a-f0-9]{64}$') { throw 'An immutable official Alpine image is required.' }
    foreach ($value in @($lock.pythonVersion, $lock.qemuVersion, $lock.e2fsprogsVersion)) {
        if ($value -notmatch '^[0-9][0-9a-z.\-]+$') { throw 'An exact APK package version is required.' }
    }
    $revision = $env:HA_BUILD_SOURCE
    if (!$revision) { $revision = git rev-parse HEAD; if ($LASTEXITCODE) { throw 'Cannot resolve the source revision.' } }
    if ($revision -notmatch '^[a-f0-9]{40}$') { throw 'HA_BUILD_SOURCE must be a full source revision.' }
    & docker build --file hosting/backup-bootstrap/Dockerfile --build-arg "BASE_IMAGE=$($lock.baseImage)" --build-arg "PYTHON_VERSION=$($lock.pythonVersion)" --build-arg "QEMU_VERSION=$($lock.qemuVersion)" --build-arg "E2FSPROGS_VERSION=$($lock.e2fsprogsVersion)" --label "org.opencontainers.image.revision=$revision" --label 'org.opencontainers.image.source=https://github.com/Ding-Ding-Projects/home-assistant-material' --tag home-assistant-material:backup-bootstrap-local hosting/backup-bootstrap
    if ($LASTEXITCODE) { throw "Bootstrap helper build exited $LASTEXITCODE." }
    & docker image inspect home-assistant-material:backup-bootstrap-local --format 'Built {{.Id}}'
    if ($LASTEXITCODE) { throw 'The bootstrap helper image is missing.' }
} catch { Write-Error $_; exit 1 }
