$ErrorActionPreference = 'Stop'
$CipherPackageVersion = (Get-Content ./package.json -Raw | ConvertFrom-Json).version
$CipherPackageRoot = (Resolve-Path ./dist).Path
$CipherSums = foreach ($File in Get-ChildItem $CipherPackageRoot -Filter *.exe) {
    '{0}  {1}' -f (Get-FileHash $File.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $File.Name
}
$CipherSums | Set-Content (Join-Path $CipherPackageRoot 'SHA256SUMS.txt') -Encoding ascii
function Invoke-WebRequest {
    param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile)
    $Name = [IO.Path]::GetFileName(([Uri]$Uri).AbsolutePath)
    if ($Name -notmatch '^(SHA256SUMS\.txt|Cipher-[0-9].*\.exe)$') { throw 'Unexpected installer fixture request.' }
    Copy-Item (Join-Path $CipherPackageRoot $Name) $OutFile
}
& ./install.ps1 -Version $CipherPackageVersion
Get-Process -Name Cipher -ErrorAction SilentlyContinue | Stop-Process -Force
$CipherInstalled = @(Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Programs') -Filter Cipher.exe -Recurse -File)
if ($CipherInstalled.Count -ne 1) { throw 'The setup did not install exactly one Cipher executable.' }
& node scripts/smoke.mjs $CipherInstalled[0].FullName
if ($LASTEXITCODE -ne 0) { throw 'The installed Windows app did not start correctly.' }
& ./install.ps1 -Version $CipherPackageVersion -Portable
$CipherPortable = Join-Path $env:LOCALAPPDATA 'Programs\CipherPortable\Cipher.exe'
if (-not (Test-Path $CipherPortable)) { throw 'The portable terminal install is missing.' }
& node scripts/smoke.mjs $CipherPortable
if ($LASTEXITCODE -ne 0) { throw 'The portable Windows app did not start correctly.' }
Write-Host 'PASS: terminal setup/portable installation, checksums and installed application startup.'
