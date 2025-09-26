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
        exit 1
    }

    $packages = Get-Content $filePath | Where-Object { -Not ($_ -match '^\s*$') -and -Not ($_ -match '^#') }

    foreach ($package in $packages) {
        try {
            scoop install $package
        } catch {
            Write-Host "❖ Failed to install Scoop package:" -ForegroundColor Red
            Write-Host "- $package: $_"  -ForegroundColor Red
            # Continue to next package, but don't exit here
        }
    }
}
function Install-PnpmPackages {
    param (
        [string]$filePath
    )

    if (-Not (Test-Path $filePath)) {
        Write-Host "❖ Pnpm package list file not found:" -ForegroundColor Red
        Write-Host "$filePath" -ForegroundColor Red
        exit 1
    }

    $packages = Get-Content $filePath | Where-Object { -Not ($_ -match '^\s*$') -and -Not ($_ -match '^#') }

    foreach ($package in $packages) {
        try {
            pnpm install -g $package
        } catch {
            Write-Host "❖ Failed to install pnpm package:" -ForegroundColor Red
            Write-Host "- $package: $_" -ForegroundColor Red
            # Continue to next package, but don't exit here
        }
    }
}

#####
## scoop installation (please migrate to winget i beg)
#####
if (!(Get-Command scoop -ErrorAction SilentlyContinue)) {
    try {
        Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
        Write-Host "Scoop installed successfully." -ForegroundColor Green
    } catch {
        Write-Host "Failed to install Scoop:" -ForegroundColor Red
        Write-Host "- $_" -ForegroundColor Red
        exit 1
    }
}

## add buckets
try {
    scoop bucket add extras
    scoop bucket add versions
} catch {
    Write-Host "Failed to add Scoop buckets:" -ForegroundColor Red
    Write-Host "- $_" -ForegroundColor Red
    exit 1
}

#####
## download Scoop packages list
#####
$scoopPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-windows/scoop.txt"
$scoopPackagesFile = "$env:TEMP\scoop.txt"

try {
    Invoke-WebRequest -Uri $scoopPackagesUrl -OutFile $scoopPackagesFile
    Write-Host "Scoop packages list downloaded." -ForegroundColor Green
} catch {
    Write-Host "❖ Failed to download Scoop packages list:" -ForegroundColor Red
    Write-Host "- $_" -ForegroundColor Red
    exit 1
}

#####
## run package install functions
#####
Install-ScoopPackages -filePath $scoopPackagesFile

#####
## scoop temp files cleanup
#####
Remove-Item $scoopPackagesFile -ErrorAction SilentlyContinue

# verify profile is working (pnpm PATH added) and pnpm is available
$pnpmPath = "$env:LOCALAPPDATA\pnpm"
$pathArray = $env:PATH -split ';'
if (-not ($pathArray -contains $pnpmPath) -or !(Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "❖ Installation incomplete: PowerShell profile may not be loaded, or pnpm is not installed/not on PATH." -ForegroundColor Red
    Write-Host "   - Expected pnpm PATH: $pnpmPath" -ForegroundColor Yellow
    Write-Host "   - Run in a new PowerShell session and verify profile at: $PROFILE" -ForegroundColor Yellow
    exit 1
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
    exit 1
}

#####
## run pnpm package install functions
#####
Install-PnpmPackages -filePath $pnpmPackagesFile

#####
## pnpm temp files cleanup
#####
Remove-Item $pnpmPackagesFile -ErrorAction SilentlyContinue

## end message
Write-Host "❖ Installation complete" -ForegroundColor Green
