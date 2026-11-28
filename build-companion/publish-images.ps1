param([Parameter(Mandatory)][string]$Stage)
$ErrorActionPreference = 'Stop'
try {
    $folder = Get-Item -LiteralPath $Stage
    $images = @(Get-ChildItem -LiteralPath $folder.FullName -File -Filter 'haos_*')
    if ($images.Count -eq 0) { throw 'The build finished without producing an appliance image.' }
    foreach ($image in $images) {
        if ($image.Length -eq 0) { throw "Empty build output: $($image.Name)" }
        $hash = (Get-FileHash -LiteralPath $image.FullName -Algorithm SHA256).Hash
        $destination = Join-Path $folder.Parent.FullName $image.Name
        if (Test-Path -LiteralPath $destination) {
            if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $hash) {
                throw "An earlier build has a different $($image.Name). The new image remains in $Stage."
            }
            Remove-Item -LiteralPath $image.FullName
        } else {
            [IO.File]::Move($image.FullName, $destination)
        }
        Write-Host "$hash  $destination"
    }
    [IO.Directory]::Delete($folder.FullName, $false)
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 5 }
