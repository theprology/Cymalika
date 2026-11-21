$ErrorActionPreference = 'Stop'
$CyMalikaPackageVersion = (Get-Content ./package.json -Raw | ConvertFrom-Json).version
$CyMalikaPackageRoot = (Resolve-Path ./dist).Path
$CyMalikaSums = foreach ($File in Get-ChildItem $CyMalikaPackageRoot -Filter *.exe) {
    '{0}  {1}' -f (Get-FileHash $File.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $File.Name
}
$CyMalikaSums | Set-Content (Join-Path $CyMalikaPackageRoot 'SHA256SUMS.txt') -Encoding ascii
function Invoke-WebRequest {
    param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile)
    $Name = [IO.Path]::GetFileName(([Uri]$Uri).AbsolutePath)
    if ($Name -notmatch '^(SHA256SUMS\.txt|CyMalika-[0-9].*\.exe)$') { throw 'Unexpected installer fixture request.' }
    Copy-Item (Join-Path $CyMalikaPackageRoot $Name) $OutFile
}
& ./install.ps1 -Version $CyMalikaPackageVersion
Get-Process -Name CyMalika -ErrorAction SilentlyContinue | Stop-Process -Force
$CyMalikaInstalled = @(Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Programs') -Filter CyMalika.exe -Recurse -File)
if ($CyMalikaInstalled.Count -ne 1) { throw 'The setup did not install exactly one CyMalika executable.' }
& node scripts/smoke.mjs $CyMalikaInstalled[0].FullName
if ($LASTEXITCODE -ne 0) { throw 'The installed Windows app did not start correctly.' }
& ./install.ps1 -Version $CyMalikaPackageVersion -Portable
$CyMalikaPortable = Join-Path $env:LOCALAPPDATA 'Programs\CyMalikaPortable\CyMalika.exe'
if (-not (Test-Path $CyMalikaPortable)) { throw 'The portable terminal install is missing.' }
& node scripts/smoke.mjs $CyMalikaPortable
if ($LASTEXITCODE -ne 0) { throw 'The portable Windows app did not start correctly.' }
Write-Host 'PASS: terminal setup/portable installation, checksums and installed application startup.'
