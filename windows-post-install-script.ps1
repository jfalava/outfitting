#####
## scoop installation (please migrate to winget i beg)
#####
if (!(Get-Command scoop -ErrorAction SilentlyContinue)) {
    try {
        Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
    } catch {
        Write-Host "Failed to install Scoop:"
        Write-Host "- $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Scoop is already installed, continuing..." -ForegroundColor Green
}
## add buckets (cuz ofc you need more steps right)
scoop bucket add extras
scoop bucket add versions

#####
## download Scoop packages list
#####
$scoopPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-windows/scoop.txt"
$scoopPackagesFile = "$env:TEMP\scoop.txt"

try {
    Invoke-WebRequest -Uri $scoopPackagesUrl -OutFile $scoopPackagesFile
} catch {
    Write-Host "❖ Failed to download Scoop packages list:" -ForegroundColor Red
    Write-Host "- $_" -ForegroundColor Red
    return
}

#####
## functions
#####
function Install-ScoopPackages {
    param (
        [string]$filePath
    )

    if (-Not (Test-Path $filePath)) {
        Write-Host "❖ Scoop package list file not found:" -ForegroundColor Red
        Write-Host "$filePath" -ForegroundColor Red
        return
    }

    $packages = Get-Content $filePath | Where-Object { -Not ($_ -match '^\s*$') -and -Not ($_ -match '^#') }

    foreach ($package in $packages) {
        try {
            scoop install $package
        } catch {
            Write-Host "❖ Failed to install Scoop packages:" -ForegroundColor Red
            Write-Host "- $package: $_"  -ForegroundColor Red
        }
    }
}
function Install-PnpmPackages {
    param (
        [string]$filePath
    )

    if (-Not (Test-Path $filePath)) {
        Write-Host "File not found: $filePath" -ForegroundColor Red
        return
    }

    $packages = Get-Content $filePath | Where-Object { -Not ($_ -match '^\s*$') -and -Not ($_ -match '^#') }

    foreach ($package in $packages) {
        try {
            pnpm install -g $package
        } catch {
            Write-Host "Failed to install $package: $_" -ForegroundColor Red
        }
    }
}

#####
## run package install functions
#####
Install-ScoopPackages -filePath $scoopPackagesFile

#####
## cleanups
#####
Remove-Item $scoopPackagesFile -ErrorAction SilentlyContinue

# Test if the profile is working and if pnpm is on PATH
if (!(which pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "❖ Installation incomplete: either the PowerShell profile is missing or pnpm is not installed/not on PATH" -ForegroundColor Red
    Remove-Item $pnpmPackagesFile -ErrorAction SilentlyContinue
    exit 1 # no need to continue
}

#####
## download pnpm packages list
#####
$pnpmPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/pnpm.txt"
$pnpmPackagesFile = "$env:TEMP\pnpm.txt"

try {
    Invoke-WebRequest -Uri $pnpmPackagesUrl -OutFile $pnpmPackagesFile
} catch {
    Write-Host "❖ Failed to download pnpm packages list:" -ForegroundColor Red
    Write-Host "- $_" -ForegroundColor Red
    return
}

#####
## run pnpm package install functions
#####
Install-PnpmPackages -filePath $pnpmPackagesFile

#####
## cleanups
#####
Remove-Item $pnpmPackagesFile -ErrorAction SilentlyContinue
Write-Host "❖ Installation complete" -ForegroundColor Green
