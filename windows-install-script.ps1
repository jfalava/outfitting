# check and accept Winget terms of use
Write-Host "❔ Checking Winget terms of use..."
winget --info
# define URLs and local paths
$wingetPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/winget.txt"
$msStorePackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/msstore-winget.txt"
$wingetPackagesFile = "$env:TEMP\winget.txt"
$msStorePackagesFile = "$env:TEMP\msstore-winget.txt"
# download the files
try {
    Invoke-WebRequest -Uri $wingetPackagesUrl -OutFile $wingetPackagesFile
    Invoke-WebRequest -Uri $msStorePackagesUrl -OutFile $msStorePackagesFile
} catch {
    Write-Host "❌ Failed to download package lists: $_" -ForegroundColor Red
    exit 1
}
# install packages from a given file
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
        Write-Host "❖❖❖❖❖❖❖❖❖❖❖❖❖❖❖❖❖❖❖"
        Write-Host "❖ Installing $package... ❖"
        Write-Host "❖❖❖❖❖❖❖❖❖❖❖❖❖❖❖❖❖❖❖"
        winget install --id $package --accept-source-agreements --accept-package-agreements -e
    }
}
# install Winget packages
Write-Host "📦 Installing Winget packages..."
Install-WingetPackages -filePath $wingetPackagesFile
# install Microsoft Store packages
Write-Host "🛒 Installing Microsoft Store packages..."
Install-WingetPackages -filePath $msStorePackagesFile
# cleanup temporary files
Remove-Item $wingetPackagesFile -ErrorAction SilentlyContinue
Remove-Item $msStorePackagesFile -ErrorAction SilentlyContinue
## end message
Write-Host "✅ All installations complete."
