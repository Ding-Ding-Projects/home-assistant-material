param([Parameter(Mandatory = $true)][string]$Setup)
$ErrorActionPreference = 'Stop'
try {
    # Load the module belonging to this PowerShell host, not an inherited module path.
    Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
    Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
    $file = Get-Item -LiteralPath $Setup -ErrorAction Stop
    if (!$file.Length) { throw 'The installer is empty.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName -ErrorAction Stop
    if ($signature.Status -ne 'NotSigned') { throw "The installer signature status is $($signature.Status); NotSigned is required." }
    $releaseIndex = Join-Path $file.DirectoryName 'RELEASES'
    if (!(Test-Path -LiteralPath $releaseIndex -PathType Leaf)) { throw 'The Squirrel RELEASES index is missing.' }
    $packages = @(Get-ChildItem -LiteralPath $file.DirectoryName -Filter '*-full.nupkg' -File)
    if (!$packages.Count) { throw 'The full Squirrel package is missing.' }
    Write-Output 'Installer signature status: NotSigned'
    Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName, $releaseIndex, $packages.FullName | ForEach-Object { Write-Output ('SHA-256 ' + $_.Hash.ToLowerInvariant() + ' ' + [IO.Path]::GetFileName($_.Path)) }
} catch { Write-Error $_; exit 1 }
