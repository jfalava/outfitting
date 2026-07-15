# Post install script for Windows

## This requires a shell reload.

$ErrorActionPreference = "Stop"
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

###################################### Scoop
$scoopPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-windows/scoop.txt"
try {
    Invoke-RestMethod -Uri https://get.scoop.sh -ErrorAction Stop | Invoke-Expression
    . $PROFILE
} catch {
    Write-Host "❖ Failed to install or load Scoop: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

function Get-ScoopBucketName([string] $BucketUrl) {
    $normalizedUrl = $BucketUrl.Trim().TrimEnd("/")
    $normalizedUrl = $normalizedUrl -replace '(?i)\.git$', ''
    $normalizedUrl = $normalizedUrl.TrimEnd("/")
    $segments = $normalizedUrl -split '/' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    if ($segments.Count -eq 0) { return $null }

    $bucketName = $segments[-1] -replace '^(?i:scoop-)', ''
    if ([string]::IsNullOrWhiteSpace($bucketName)) { return $null }

    return $bucketName
}

try {
    $scoopPackagesContent = Invoke-RestMethod -Uri $scoopPackagesUrl -ErrorAction Stop
} catch {
    Write-Host "❖ Failed to download Scoop package list:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
    exit 1
}

$scoopBuckets = [System.Collections.Generic.List[string]]::new()
$scoopPackages = [System.Collections.Generic.List[string]]::new()
$invalidScoopEntries = 0
$lineNumber = 0

foreach ($line in [regex]::Split([string] $scoopPackagesContent, "\r?\n")) {
    $lineNumber++
    $entry = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($entry) -or $entry.StartsWith("#")) { continue }

    $bucketMatch = [regex]::Match($entry, '^(?i:bucket)\s+"(?<value>[^"\r\n]*\S[^"\r\n]*)"\s*$')
    $packageMatch = [regex]::Match($entry, '^(?i:package)\s+"(?<value>[^"\r\n]*\S[^"\r\n]*)"\s*$')

    if ($bucketMatch.Success) {
        $scoopBuckets.Add($bucketMatch.Groups["value"].Value.Trim())
    } elseif ($packageMatch.Success) {
        $scoopPackages.Add($packageMatch.Groups["value"].Value.Trim())
    } else {
        $invalidScoopEntries++
        Write-Host "❖ Ignoring invalid Scoop list entry on line ${lineNumber}: $entry" -ForegroundColor Yellow
    }
}

$successfulBuckets = 0
$successfulPackages = 0
$failedScoopCommands = 0

foreach ($bucketUrl in $scoopBuckets) {
    $bucketName = Get-ScoopBucketName $bucketUrl
    if ($null -eq $bucketName) {
        $failedScoopCommands++
        Write-Host "❖ Failed to derive Scoop bucket name from: $bucketUrl" -ForegroundColor Red
        continue
    }

    & scoop bucket add $bucketName $bucketUrl
    if ($LASTEXITCODE -eq 0) {
        $successfulBuckets++
        Write-Host "❖ Added Scoop bucket: $bucketName" -ForegroundColor Green
    } else {
        $failedScoopCommands++
        Write-Host "❖ Failed to add Scoop bucket: $bucketName" -ForegroundColor Red
    }
}

foreach ($package in $scoopPackages) {
    & scoop install $package
    if ($LASTEXITCODE -eq 0) {
        $successfulPackages++
        Write-Host "❖ Installed Scoop package: $package" -ForegroundColor Green
    } else {
        $failedScoopCommands++
        Write-Host "❖ Failed to install Scoop package: $package" -ForegroundColor Red
    }
}

Write-Host "❖ Scoop: $successfulBuckets bucket(s) added, $successfulPackages package(s) installed, $invalidScoopEntries invalid list entry/entries, $failedScoopCommands failure(s)." -ForegroundColor Cyan
if ($failedScoopCommands -gt 0) { exit 1 }
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
    Write-Host "❖ Scoop installation complete; skipping private fonts because this shell is not elevated." -ForegroundColor Yellow
    exit 0
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
    Write-Host "❖ Private font installation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Remove-Item -LiteralPath $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
############################################
