# Check and accept Winget terms of use
Write-Host "Checking Winget terms of use..."
winget --info

# Proceed with the rest of the script after acceptance
# Define file paths for packages and Microsoft Store packages
$wingetPackagesFile = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/winget.txt"
$msStorePackagesFile = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/msstore-winget.txt"

# Function to install packages from a given file
function Install-WingetPackages {
    param (
        [string]$filePath
    )

    if (-Not (Test-Path $filePath)) {
        Write-Host "❌ File not found: $filePath" -ForegroundColor Red
        return
    }

    $packages = Get-Content $filePath | Where-Object { -Not ($_ -match '^\s*$') -and -Not ($_ -match '^#') }

    foreach ($package in $packages) {
        Write-Host "❖ Installing $package..."
        winget install --id $package --accept-source-agreements --accept-package-agreements -e
    }
}

# Install Winget packages
Write-Host "📦 Installing Winget packages..."
Install-WingetPackages -filePath $wingetPackagesFile

# Install Microsoft Store packages
Write-Host "🛒 Installing Microsoft Store packages..."
Install-WingetPackages -filePath $msStorePackagesFile

Write-Host "✅ All installations complete."
