#############################################
################# Windows Post-Install Script
#############################################

param(
    [string]$OutfittingManifestBaseUrl = $env:OUTFITTING_MANIFEST_BASE_URL,
    [string]$OutfittingManifestRef = $env:OUTFITTING_MANIFEST_REF
)

## This requires a shell reload.

$ErrorActionPreference = "Stop"

######################### Outfitting manager
$outfittingManagerReleaseUrl = "https://github.com/jfalava/outfitting/releases/latest/download"
$outfittingManagerAsset = "outfitting-manager-windows-x64.zip"
$outfittingManagerEntry = "outfitting-manager.exe"
$outfittingManagerInstallPath = "$env:USERPROFILE\.local\bin\outfitting-manager.exe"
$outfittingStateRoot = if ([string]::IsNullOrWhiteSpace($env:OUTFITTING_STATE_ROOT)) {
    Join-Path $(if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { "$env:USERPROFILE\AppData\Local" }) "outfitting"
} else {
    $env:OUTFITTING_STATE_ROOT
}

function Get-OutfittingManifestSource {
    $resolvedBaseUrl = $OutfittingManifestBaseUrl
    $resolvedRef = $OutfittingManifestRef

    if ([string]::IsNullOrWhiteSpace($resolvedBaseUrl)) {
        $resolvedBaseUrl = "https://raw.githubusercontent.com/jfalava/outfitting"
    }
    if ([string]::IsNullOrWhiteSpace($resolvedRef)) {
        $resolvedRef = "main"
    }

    return [PSCustomObject]@{
        BaseUrl = $resolvedBaseUrl.TrimEnd("/")
        Ref = $resolvedRef
    }
}

function Get-OutfittingWindowsRoute {
    param (
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Default
    )

    return $Default.Trim().Trim("/")
}

function Install-OutfittingManagerQuietly {
    if (Test-Path -LiteralPath $outfittingManagerInstallPath -PathType Leaf) {
        return
    }

    $installDirectory = Split-Path -Parent $outfittingManagerInstallPath
    $temporaryArchive = Join-Path $env:TEMP "$outfittingManagerAsset.post-install.download"
    $temporaryChecksum = Join-Path $env:TEMP "$outfittingManagerAsset.post-install.sha256"
    $temporaryExtractDirectory = Join-Path $env:TEMP "outfitting-manager-post-install-extract"

    try {
        Invoke-WebRequest -Uri "$outfittingManagerReleaseUrl/$outfittingManagerAsset" -OutFile $temporaryArchive -ErrorAction Stop
        Invoke-WebRequest -Uri "$outfittingManagerReleaseUrl/$outfittingManagerAsset.sha256" -OutFile $temporaryChecksum -ErrorAction Stop

        $expectedChecksum = ((Get-Content -LiteralPath $temporaryChecksum -Raw -ErrorAction Stop).Trim() -split "\s+")[0]
        $actualChecksum = (Get-FileHash -LiteralPath $temporaryArchive -Algorithm SHA256 -ErrorAction Stop).Hash
        if ($actualChecksum -ne $expectedChecksum) {
            return
        }

        if (Test-Path -LiteralPath $temporaryExtractDirectory) {
            Remove-Item -LiteralPath $temporaryExtractDirectory -Recurse -Force -ErrorAction Stop
        }
        New-Item -Path $temporaryExtractDirectory -ItemType Directory -Force -ErrorAction Stop | Out-Null
        Expand-Archive -LiteralPath $temporaryArchive -DestinationPath $temporaryExtractDirectory -Force

        $extractedBinary = Join-Path $temporaryExtractDirectory $outfittingManagerEntry
        if (-not (Test-Path -LiteralPath $extractedBinary -PathType Leaf)) {
            return
        }

        New-Item -Path $installDirectory -ItemType Directory -Force -ErrorAction Stop | Out-Null
        Move-Item -LiteralPath $extractedBinary -Destination $outfittingManagerInstallPath -Force -ErrorAction Stop
    } catch {
        # The post-install script is best-effort for outfitting-manager.
    } finally {
        Remove-Item -LiteralPath $temporaryArchive -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $temporaryChecksum -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $temporaryExtractDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Install-OutfittingManagerQuietly
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

###################################### Scoop and desired-state sync
$failedPackageCommands = 0
if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
    try {
        Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
        Invoke-RestMethod -Uri https://get.scoop.sh -ErrorAction Stop | Invoke-Expression
    } catch {
        $failedPackageCommands++
        Write-Host "❖ Failed to install Scoop: $($_.Exception.Message)" -ForegroundColor Red
    }
}

$scoopShims = Join-Path $env:USERPROFILE "scoop\shims"
if (Test-Path -LiteralPath $scoopShims -PathType Container) {
    $env:PATH = "$scoopShims;$env:PATH"
}
$wingetLinks = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links"
if (Test-Path -LiteralPath $wingetLinks -PathType Container) {
    $env:PATH = "$wingetLinks;$env:PATH"
}

if (Test-Path -LiteralPath $outfittingManagerInstallPath -PathType Leaf) {
    & $outfittingManagerInstallPath init
    if ($LASTEXITCODE -ne 0) {
        $failedPackageCommands++
        Write-Host "❖ outfitting-manager init failed (exit $LASTEXITCODE)." -ForegroundColor Red
    } else {
        & $outfittingManagerInstallPath apply --yes
        if ($LASTEXITCODE -ne 0) {
            $failedPackageCommands++
            Write-Host "❖ outfitting-manager apply failed (exit $LASTEXITCODE)." -ForegroundColor Red
        }
    }
} else {
    $failedPackageCommands++
    Write-Host "❖ outfitting-manager is unavailable; skipping Windows package sync." -ForegroundColor Red
}
############################################

#################### Install public fonts via FontGet
$installedFontGetFonts = 0

if (-not (Get-Command fontget -ErrorAction SilentlyContinue)) {
    Write-Host "`n❖ Installing FontGet..." -ForegroundColor Cyan
    if (Test-Path -LiteralPath $outfittingManagerInstallPath -PathType Leaf) {
        & $outfittingManagerInstallPath winget install Graphixa.FontGet --no-push
        if ($LASTEXITCODE -ne 0) { $failedPackageCommands++ }
    } else {
        $failedPackageCommands++
    }
}

if (-not (Get-Command fontget -ErrorAction SilentlyContinue)) {
    $failedPackageCommands++
    Write-Host "❖ FontGet is unavailable; continuing with the private font download." -ForegroundColor Red
} else {
    try {
        $manifestSource = Get-OutfittingManifestSource
        $fontListRoute = Get-OutfittingWindowsRoute -Name "fontListPath" -Default "fonts/fontget.txt"
        $fontGetListUrl = "$($manifestSource.BaseUrl)/$([Uri]::EscapeDataString($manifestSource.Ref))/$fontListRoute"
        $fontGetListContent = Invoke-RestMethod -Uri $fontGetListUrl -ErrorAction Stop
        $env:FONTGET_ACCEPT_DEFAULTS = "1"
        $env:FONTGET_ACCEPT_AGREEMENTS = "1"

        foreach ($line in [regex]::Split([string] $fontGetListContent, "\r?\n")) {
            $font = $line.Trim()
            if ([string]::IsNullOrWhiteSpace($font) -or $font.StartsWith("#")) { continue }

            Write-Host "❖ Installing font via FontGet: $font" -ForegroundColor Cyan
            & fontget add $font
            if ($LASTEXITCODE -eq 0) {
                $installedFontGetFonts++
            } else {
                $failedPackageCommands++
                Write-Host "❖ FontGet failed to install: $font" -ForegroundColor Red
            }
        }
    } catch {
        $failedPackageCommands++
        Write-Host "❖ FontGet font installation failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "❖ FontGet: $installedFontGetFonts font(s) processed." -ForegroundColor Cyan
if ($failedPackageCommands -gt 0) {
    Write-Host "❖ FontGet had failures; continuing with the private font download." -ForegroundColor Yellow
}
############################################

################## Private Font Downloader

function Stop-FontInstall([string] $Message) {
    throw "Private font download failed: $Message"
}
function Test-SafeFontArchive([string] $ArchivePath) {
    $entries = & tar -tzf $ArchivePath
    if ($LASTEXITCODE -ne 0) { Stop-FontInstall "unable to list archive contents" }

    $stream = [IO.File]::OpenRead($ArchivePath)
    $gzip = [IO.Compression.GzipStream]::new($stream, [IO.Compression.CompressionMode]::Decompress)
    try {
        $header = [byte[]]::new(512)
        while ($true) {
            $read = 0
            while ($read -lt $header.Length) {
                $count = $gzip.Read($header, $read, $header.Length - $read)
                if ($count -eq 0) { Stop-FontInstall "unable to inspect archive contents" }
                $read += $count
            }
            if (($header | Where-Object { $_ -ne 0 }).Count -eq 0) { break }

            $type = [char]$header[156]
            if ($type -eq '1' -or $type -eq '2') {
                Stop-FontInstall "archive contains a symbolic or hard link"
            }

            $sizeText = [Text.Encoding]::ASCII.GetString($header, 124, 12).Trim([char]0, ' ')
            $size = if ([string]::IsNullOrEmpty($sizeText)) { 0 } else { [Convert]::ToInt64($sizeText, 8) }
            $padding = (512 - ($size % 512)) % 512
            $remaining = $size + $padding
            $discard = [byte[]]::new(8192)
            while ($remaining -gt 0) {
                $count = $gzip.Read($discard, 0, [int][Math]::Min($remaining, $discard.Length))
                if ($count -eq 0) {
                    Stop-FontInstall "unable to inspect archive contents"
                }
                $remaining -= $count
            }
        }
    } finally {
        $gzip.Dispose()
        $stream.Dispose()
    }

    $fontEntryCount = 0
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
        $fontEntryCount++
    }

    if ($fontEntryCount -eq 0) { Stop-FontInstall "archive did not contain any font files" }
}
############################################

############################ Font Downloader
$tempDirectory = Join-Path $env:TEMP ("outfitting-fonts-" + [guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $tempDirectory "fonts.tar.gz"
$checksumPath = Join-Path $tempDirectory "fonts.tar.gz.sha256"
$downloadsPath = Join-Path $env:USERPROFILE "Downloads"
$fontsPath = Join-Path $downloadsPath "fonts"
$fontUrl = "https://win.jfa.dev/fonts"
$checksumUrl = "https://win.jfa.dev/fonts/checksum"
try {
    if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        if (Test-Path -LiteralPath $outfittingManagerInstallPath -PathType Leaf) {
            & $outfittingManagerInstallPath winget install Cloudflare.cloudflared --no-push
            if ($LASTEXITCODE -ne 0) { $failedPackageCommands++ }
        }
    }
    if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        Stop-FontInstall "cloudflared is not available after installation; restart this shell and try again"
    }

    New-Item -ItemType Directory -Force -Path $tempDirectory, $downloadsPath | Out-Null
    Write-Host "❖ Authenticating to fetch licensed fonts..." -ForegroundColor Cyan
    & cloudflared access login $fontUrl
    if ($LASTEXITCODE -ne 0) { Stop-FontInstall "Cloudflare Access login failed" }
    & cloudflared access curl $fontUrl --fail -o $archivePath
    if ($LASTEXITCODE -ne 0) { Stop-FontInstall "font archive download failed" }
    & cloudflared access curl $checksumUrl --fail -o $checksumPath
    if ($LASTEXITCODE -ne 0) { Stop-FontInstall "font checksum download failed" }

    $checksum = [IO.File]::ReadAllText($checksumPath)
    if ($checksum -notmatch '^(?<hash>[A-Fa-f0-9]{64})  fonts\.tar\.gz\r?\n?$') {
        Stop-FontInstall "font checksum has an invalid format"
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash
    if ($actualHash -ine $Matches.hash) { Stop-FontInstall "font archive checksum mismatch" }

    Test-SafeFontArchive $archivePath
    & tar -xzf $archivePath -C $downloadsPath
    if ($LASTEXITCODE -ne 0) { Stop-FontInstall "font archive extraction failed" }

    Write-Host "`n❖ Private fonts extracted to: $fontsPath" -ForegroundColor Green
    Write-Host "❖ Install the fonts from that folder if you want to use them." -ForegroundColor Cyan
} catch {
    Write-Host "❖ Private fonts were not downloaded: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "❖ Continuing without private fonts; Cloudflare Access permission is optional." -ForegroundColor Yellow
} finally {
    Remove-Item -LiteralPath $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
if ($failedPackageCommands -gt 0) { exit 1 }
############################################
