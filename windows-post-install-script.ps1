# Post install script for Windows

## This requires a shell reload.

$ErrorActionPreference = "Stop"
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

###################################### Scoop
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
. $PROFILE
############################################

################### Universal Font Installer

############### Admin to install to all users
function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Stop-FontInstall([string] $Message) {
    throw "Private font installation failed: $Message"
}
function Test-SafeFontArchive([string] $ArchivePath) {
    $entries = & tar -tzf $ArchivePath
    if ($LASTEXITCODE -ne 0) { Stop-FontInstall "unable to list archive contents" }

    $verboseEntries = & tar -tvzf $ArchivePath
    if ($LASTEXITCODE -ne 0) { Stop-FontInstall "unable to inspect archive contents" }
    if ($verboseEntries | Where-Object { $_ -match '^\s*[lh]' }) {
        Stop-FontInstall "archive contains a symbolic or hard link"
    }

    foreach ($entry in $entries) {
        $normalized = $entry -replace '\\', '/'
        if (-not $normalized.StartsWith("fonts/")) { Stop-FontInstall "archive entry is outside fonts/: $entry" }
        if ($normalized.StartsWith("/") -or $normalized.Contains("//")) { Stop-FontInstall "archive entry has an unsafe path: $entry" }
        if ($normalized.EndsWith("/")) { continue }

        foreach ($part in $normalized.Split('/')) {
            if ([string]::IsNullOrWhiteSpace($part) -or $part -eq "." -or $part -eq "..") {
                Stop-FontInstall "archive entry has an unsafe path: $entry"
            }
        }

        if ([IO.Path]::GetExtension($normalized).ToLowerInvariant() -notin ".otf", ".ttf", ".ttc") {
            Stop-FontInstall "archive contains a non-font payload: $entry"
        }
    }
}
if (-not (Test-Administrator)) {
    throw "Run PowerShell as Administrator to install fonts for all users."
}
############################################

############################# Font Installer
$tempDirectory = Join-Path $env:TEMP ("outfitting-fonts-" + [guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $tempDirectory "fonts.tar.gz"
$checksumPath = Join-Path $tempDirectory "fonts.tar.gz.sha256"
$stagingPath = Join-Path $tempDirectory "staging"
$fontUrl = "https://win.jfa.dev/fonts"
$checksumUrl = "https://win.jfa.dev/fonts/checksum"
$installed = 0
$skipped = 0
$failed = 0
try {
    if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
    }
    if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        Stop-FontInstall "cloudflared is not available after installation; restart this elevated shell and try again"
    }

    New-Item -ItemType Directory -Force -Path $tempDirectory, $stagingPath | Out-Null
    Write-Host "❖ Authenticating to fetch licensed fonts..." -ForegroundColor Cyan
    & cloudflared access login $fontUrl
    if ($LASTEXITCODE -ne 0) { Stop-FontInstall "Cloudflare Access login failed" }
    & cloudflared access curl --fail $fontUrl -o $archivePath
    if ($LASTEXITCODE -ne 0) { Stop-FontInstall "font archive download failed" }
    & cloudflared access curl --fail $checksumUrl -o $checksumPath
    if ($LASTEXITCODE -ne 0) { Stop-FontInstall "font checksum download failed" }

    $checksum = [IO.File]::ReadAllText($checksumPath)
    if ($checksum -notmatch '^(?<hash>[A-Fa-f0-9]{64})  fonts\.tar\.gz\r?\n?$') {
        Stop-FontInstall "font checksum has an invalid format"
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash
    if ($actualHash -ine $Matches.hash) { Stop-FontInstall "font archive checksum mismatch" }

    Test-SafeFontArchive $archivePath
    & tar -xzf $archivePath -C $stagingPath
    if ($LASTEXITCODE -ne 0) { Stop-FontInstall "font archive extraction failed" }

    $shell = New-Object -ComObject Shell.Application
    $fontsFolder = $shell.Namespace(0x14)
    if ($null -eq $fontsFolder) { Stop-FontInstall "Windows Fonts folder is unavailable" }

    $fontFiles = Get-ChildItem -LiteralPath (Join-Path $stagingPath "fonts") -Recurse -File |
        Where-Object { $_.Extension.ToLowerInvariant() -in ".otf", ".ttf", ".ttc" }
    if ($fontFiles.Count -eq 0) { Stop-FontInstall "archive did not contain any installable fonts" }

    foreach ($fontFile in $fontFiles) {
        $destination = Join-Path $env:WINDIR (Join-Path "Fonts" $fontFile.Name)
        if (Test-Path -LiteralPath $destination) {
            $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $fontFile.FullName).Hash
            $destinationHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash
            if ($sourceHash -eq $destinationHash) {
                Write-Host "❖ Already installed: $($fontFile.Name)" -ForegroundColor Yellow
                $skipped++
                continue
            }
        }

        $fontsFolder.CopyHere($fontFile.FullName, 0x14)
        $deadline = (Get-Date).AddSeconds(15)
        do {
            Start-Sleep -Milliseconds 250
        } until ((Test-Path -LiteralPath $destination) -or (Get-Date) -ge $deadline)

        if ((Test-Path -LiteralPath $destination) -and
            ((Get-FileHash -Algorithm SHA256 -LiteralPath $fontFile.FullName).Hash -eq (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash)) {
            Write-Host "❖ Installed: $($fontFile.Name)" -ForegroundColor Green
            $installed++
        } else {
            Write-Host "❖ Failed to install: $($fontFile.Name)" -ForegroundColor Red
            $failed++
        }
    }

    Write-Host "`n❖ Private fonts: $installed installed, $skipped unchanged, $failed failed." -ForegroundColor Cyan
    if ($failed -gt 0) { exit 1 }
} catch {
    Write-Error $_
    exit 1
} finally {
    Remove-Item -LiteralPath $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
############################################
