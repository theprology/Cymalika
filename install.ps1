[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Version = 'latest',
    [switch]$Portable,
    [switch]$VerifyOnly
)
$CyMalikaPreviousErrorActionPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Stop'
    $CyMalikaRepo = 'theprology/Cymalika'
    if ($env:OS -ne 'Windows_NT') { throw 'Use install.sh on Mac or Linux.' }
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'This release provides Windows x64 installers. Run from x64 PowerShell.' }
    if ($Version -eq 'latest') {
        $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$CyMalikaRepo/releases/latest"
        $Version = $Release.tag_name -replace '^v', ''
    }
    $Version = $Version -replace '^v', ''
    if ($Version -notmatch '^\d+\.\d+\.\d+([-+][A-Za-z0-9.-]+)?$') { throw 'Invalid release version.' }
    $Kind = if ($Portable) { 'portable' } else { 'setup' }
    $Asset = "CyMalika-$Version-x64-$Kind.exe"
    $Base = "https://github.com/$CyMalikaRepo/releases/download/v$Version"
    if (-not $PSCmdlet.ShouldProcess($Asset, 'Download, verify and install CyMalika')) { return }
    $CyMalikaTemp = Join-Path ([IO.Path]::GetTempPath()) ('cymalika-install-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $CyMalikaTemp | Out-Null
    try {
        $Download = Join-Path $CyMalikaTemp $Asset
        $Sums = Join-Path $CyMalikaTemp 'SHA256SUMS.txt'
        Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile $Download
        Invoke-WebRequest -UseBasicParsing -Uri "$Base/SHA256SUMS.txt" -OutFile $Sums
        $Expected = @()
        foreach ($Line in Get-Content $Sums) {
            if ($Line -match '^([a-fA-F0-9]{64})\s+(.+)$' -and $Matches[2] -eq $Asset) { $Expected += $Matches[1] }
        }
        if ($Expected.Count -ne 1) { throw 'The release does not contain a unique checksum for this download.' }
        $Actual = (Get-FileHash -Path $Download -Algorithm SHA256).Hash
        if ($Actual -ne $Expected[0]) { throw 'Checksum mismatch. Nothing was installed.' }
        Write-Host 'Checksum verified.'
        if ($VerifyOnly) { Write-Host 'Verification complete. Nothing was installed.'; return }
        if (Get-Process -Name CyMalika -ErrorAction SilentlyContinue) { throw 'Quit CyMalika, then run the installer again.' }
        if ($Portable) {
            $Directory = Join-Path $env:LOCALAPPDATA 'Programs\CyMalikaPortable'
            New-Item -ItemType Directory -Force -Path $Directory | Out-Null
            $Destination = Join-Path $Directory 'CyMalika.exe'
            Copy-Item -LiteralPath $Download -Destination $Destination -Force
            Write-Host "Installed. Open $Destination"
        } else {
            $Result = Start-Process -FilePath $Download -ArgumentList '/S' -Wait -PassThru
            if ($Result.ExitCode -ne 0) { throw "Installer exited with code $($Result.ExitCode)." }
            Write-Host 'CyMalika is installed. Open CyMalika from the Start menu.'
        }
        Write-Host 'Keep Ollama running to use your installed models. No model was downloaded.'
    } finally {
        Remove-Item -LiteralPath $CyMalikaTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
} finally {
    $ErrorActionPreference = $CyMalikaPreviousErrorActionPreference
}
