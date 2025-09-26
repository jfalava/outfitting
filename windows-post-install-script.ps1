# Install Scoop if not already installed
if (!(Get-Command scoop -ErrorAction SilentlyContinue)) {
    try {
        Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
    } catch {
        Write-Host "Failed to install Scoop: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Scoop is already installed, continuing..." -ForegroundColor Green
}

# Download Scoop packages list
$scoopPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-windows/scoop.txt"
$scoopPackagesFile = "$env:TEMP\scoop.txt"

try {
    Invoke-WebRequest -Uri $scoopPackagesUrl -OutFile $scoopPackagesFile
} catch {
    Write-Host "Failed to download Scoop packages list: $_" -ForegroundColor Red
    exit 1
}

# Function to install Scoop packages
function Install-ScoopPackages {
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
            scoop install $package
        } catch {
            Write-Host "Failed to install $package: $_" -ForegroundColor Red
        }
    }
}

# Install Scoop packages
Install-ScoopPackages -filePath $scoopPackagesFile

# Cleanup temporary file
Remove-Item $scoopPackagesFile -ErrorAction SilentlyContinue

# Install pnpm if not already installed
if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
        try {
        npm install -g pnpm
    } catch {
        Write-Host "Failed to install pnpm: $_" -ForegroundColor Red
    }
} else {
    Write-Host "pnpm is already installed, continuing..." -ForegroundColor Green
}

# Install global pnpm packages
$pnpmPackages = @(
    "@google/gemini-cli",
    "@qwen-code/qwen-code@latest",
    "@anthropic-ai/claude-code",
    "@openai/codex"
)

foreach ($package in $pnpmPackages) {
    try {
        pnpm install -g $package
    } catch {
        Write-Host "Failed to install $package: $_" -ForegroundColor Red
    }
}
Write-Host "❖ Installation complete" -ForegroundColor Green
