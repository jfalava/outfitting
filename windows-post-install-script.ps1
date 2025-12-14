#####
## functions
#####
function Install-BunPackages {
    param (
        [string]$filePath
    )

    if (-Not (Test-Path $filePath)) {
        Write-Host "❖ Package list file not found:" -ForegroundColor Red
        Write-Host "  - $filePath" -ForegroundColor Red
        exit 1
    }

    $packages = Get-Content $filePath | Where-Object { -Not ($_ -match '^\s*$') -and -Not ($_ -match '^#') }

    foreach ($package in $packages) {
        try {
            bun install -g $package
            Write-Host "❖ Installed Bun package: $package" -ForegroundColor Green
        } catch {
            Write-Host "❖ Failed to install Bun package:" -ForegroundColor Red
            Write-Host "  - ${package}: $_" -ForegroundColor Red
            # Continue to next package, but don't exit here
        }
    }
}

#####
## verify bun is available
#####
if (!(Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host "❖ Installation incomplete: Bun is not installed or not on PATH." -ForegroundColor Red
    Write-Host "  - Run in a new PowerShell session and verify profile at: $PROFILE" -ForegroundColor Yellow
    exit 1
}

#####
## download bun packages list
#####
$bunPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/bun.txt"
$bunPackagesFile = "$env:TEMP\bun.txt"

try {
    Invoke-WebRequest -Uri $bunPackagesUrl -OutFile $bunPackagesFile
} catch {
    Write-Host "❖ Failed to download Bun packages list:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
    exit 1
}

#####
## run bun package install functions
#####
Install-BunPackages -filePath $bunPackagesFile

#####
## bun temp files cleanup
#####
Remove-Item $bunPackagesFile -ErrorAction SilentlyContinue

## end message
Write-Host "`n❖ Installation complete." -ForegroundColor Green
