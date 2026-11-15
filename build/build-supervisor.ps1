$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
try {
    $version = (Get-Content versions.json -Raw | ConvertFrom-Json).supervisor
    if ($env:HA_BUILD_NUMBER) {
        if ($env:HA_BUILD_NUMBER -notmatch '^[0-9]+$') { throw 'HA_BUILD_NUMBER must contain digits only.' }
        $version += ".$($env:HA_BUILD_NUMBER)"
    }
    $revision = $env:HA_BUILD_SOURCE
    if (!$revision) { $revision = git rev-parse HEAD; if ($LASTEXITCODE) { throw 'Cannot resolve the source revision.' } }
    if ($revision -notmatch '^[a-f0-9]{40}$') { throw 'HA_BUILD_SOURCE must be a full source revision.' }
    New-Item -ItemType Directory -Force supervisor/wheels | Out-Null
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'aarch64' } else { 'amd64' }
    & docker build supervisor --build-arg "BUILD_VERSION=$version" --label "io.hass.arch=$arch" --label "io.hass.version=$version" --label "org.opencontainers.image.revision=$revision" --label 'org.opencontainers.image.source=https://github.com/Ding-Ding-Projects/home-assistant-material' --tag home-assistant-material:supervisor-local
    if ($LASTEXITCODE) { throw "Supervisor build exited $LASTEXITCODE." }
    & docker image inspect home-assistant-material:supervisor-local --format 'Built {{.Id}}'
    if ($LASTEXITCODE) { throw 'The Supervisor image is missing.' }
} catch { Write-Error $_; exit 1 }
