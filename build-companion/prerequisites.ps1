param(
    [ValidateSet('docker-desktop','nodejs-lts','git')] [string] $Package,
    [ValidateSet('0','1')] [string] $Silent = '0'
)
$ErrorActionPreference = 'Stop'
$commands = @{ 'docker-desktop' = 'docker.exe'; 'nodejs-lts' = 'node.exe'; git = 'git.exe' }
function Test-Installed {
    $command = Get-Command $commands[$Package] -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (!$command) { return $false }
    $version = & $command.Source --version
    if ($LASTEXITCODE -ne 0) { return $false }
    Write-Host $version
    return $true
}
try {
    if (Test-Installed) { exit 0 }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        if ($Silent -eq '1' -or $env:CI -or ![Environment]::UserInteractive) { throw "Installing $Package requires administrator approval. Run download-dependencies.bat interactively for Docker Desktop." }
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'), '-Package', $Package)
        $result = Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
        exit $result.ExitCode
    }
    $choco = Get-Command choco.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (!$choco) {
        $bootstrap = Join-Path ([IO.Path]::GetTempPath()) ("chocolatey-{0}.ps1" -f [guid]::NewGuid())
        try {
            Invoke-WebRequest -UseBasicParsing https://community.chocolatey.org/install.ps1 -OutFile $bootstrap
            $expected = '44E045ED5350758616D664C5AF631E7F2CD10165F5BF2BD82CBF3A0BB8F63462'
            if ((Get-FileHash -LiteralPath $bootstrap -Algorithm SHA256).Hash -ne $expected) { throw 'Unexpected Chocolatey bootstrap checksum.' }
            & $bootstrap
        } finally { if (Test-Path -LiteralPath $bootstrap) { Remove-Item -LiteralPath $bootstrap } }
        $choco = Get-Command (Join-Path $env:ProgramData 'chocolatey\bin\choco.exe') -ErrorAction Stop
    }
    & $choco.Source install $Package --yes --no-progress --source https://community.chocolatey.org/api/v2/
    if ($LASTEXITCODE -ne 0) { throw "Installing $Package returned $LASTEXITCODE. Follow the installer's recovery instructions." }
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + $env:Path
    if (!(Test-Installed)) { throw "$Package did not provide a usable command in this session." }
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 3 }
