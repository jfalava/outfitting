# check and accept Winget terms of use
Write-Host "❔ Checking Winget terms of use..."
winget --info
$wingetPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/winget.txt"
$msStorePackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/msstore-winget.txt"
$psModulesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/pwsh-modules.txt"
$scoopPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/scoop.txt"
$wingetPackagesFile = "$env:TEMP\winget.txt"
$msStorePackagesFile = "$env:TEMP\msstore-winget.txt"
$psModulesFile = "$env:TEMP\psmodules.txt"
$scoopPackagesFile = "$env:TEMP\scoop.txt"

# download the files
try {
    Invoke-WebRequest -Uri $wingetPackagesUrl -OutFile $wingetPackagesFile
    Invoke-WebRequest -Uri $msStorePackagesUrl -OutFile $msStorePackagesFile
    Invoke-WebRequest -Uri $psModulesUrl -OutFile $psModulesFile
    Invoke-WebRequest -Uri $scoopPackagesUrl -OutFile $scoopPackagesFile
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
        Write-Host "❖ Installing $package..."
        winget install --id $package --accept-source-agreements --accept-package-agreements -e
    }
}

# function to install pwsh modules
function Install-PSModules {
    param (
        [string]$filePath
    )

    if (-Not (Test-Path $filePath)) {
        Write-Host "❌ File not found: $filePath" -ForegroundColor Red
        return
    }

    $modules = Get-Content $filePath | Where-Object { -Not ($_ -match '^\s*$') -and -Not ($_ -match '^#') }

    foreach ($module in $modules) {
        Write-Host "📦 Installing PowerShell module: $module..."
        if (!(Get-Module -ListAvailable -Name $module)) {
            try {
                Install-Module -Name $module -Scope CurrentUser -Force -AllowClobber
                Write-Host "✅ Successfully installed $module" -ForegroundColor Green
            }
            catch {
                Write-Host "❌ Failed to install ${module}: $_" -ForegroundColor Red
            }
        } else {
            Write-Host "✓ $module is already installed" -ForegroundColor Green
        }
    }
}

# install Winget packages
Write-Host "📦 Installing Winget packages..."
Install-WingetPackages -filePath $wingetPackagesFile

# install Microsoft Store packages
Write-Host "🛒 Installing Microsoft Store packages..."
Install-WingetPackages -filePath $msStorePackagesFile

# install PowerShell modules
Write-Host "📦 Installing PowerShell modules..."
Install-PSModules -filePath $psModulesFile

# other packages
irm https://deno.land/install.ps1 | iex
powershell -c "irm bun.sh/install.ps1 | iex"

# cleanup temporary files
Remove-Item $wingetPackagesFile -ErrorAction SilentlyContinue
Remove-Item $msStorePackagesFile -ErrorAction SilentlyContinue
Remove-Item $psModulesFile -ErrorAction SilentlyContinue

# copy pwsh profile to documents
Write-Host "📎 Copying the PowerShell profile locally..."
New-Item -Path "$env:USERPROFILE\Documents\PowerShell" -ItemType Directory -Force; curl.exe -o "$env:USERPROFILE\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1" "https://   raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/Microsoft.PowerShell_profile.ps1"
New-Item -Path "$env:USERPROFILE\Documents\WindowsPowerShell" -ItemType Directory -Force; curl.exe -o "$env:USERPROFILE\Documents\PowerShell\Microsoft.PowerShell_profile.ps1" "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/Microsoft.PowerShell_profile.ps1"
New-Item -Path "$env:USERPROFILE\Documents\WindowsPowerShell" -ItemType Directory -Force; curl.exe -o "$env:USERPROFILE\Documents\PowerShell\Microsoft.VSCode_profile.ps1" "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/Microsoft.PowerShell_profile.ps1"

## end messages
Write-Host "❖ Execute:"
Write-Host "❖"
Write-Host "❖ Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression"
Write-Host "❖"
Write-Host "❖ In a new PowerShell window to install the missing, uninstallable on Admin elevation packages or that requires a source-like command."
Write-Host "❖"
Write-Host ""
Write-Host "✅ All installations complete."
