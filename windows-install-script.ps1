## init
Write-Host "Checking Winget terms of use..."
winget --info

#####
## variable setting
#####
$wingetPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-windows/winget.txt"
$msStorePackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-windows/msstore-winget.txt"
$psModulesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-windows/pwsh-modules.txt"
$scoopPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-windows/scoop.txt"
$wingetPackagesFile = "$env:TEMP\winget.txt"
$msStorePackagesFile = "$env:TEMP\msstore-winget.txt"
$psModulesFile = "$env:TEMP\psmodules.txt"
$scoopPackagesFile = "$env:TEMP\scoop.txt"

#####
# download the package lists
######
try {
    Invoke-WebRequest -Uri $wingetPackagesUrl -OutFile $wingetPackagesFile
} catch {
    Write-Host "❖ Failed to download Winget package list:" -ForegroundColor Red
    Write-Host "- $_" -ForegroundColor Red
    exit 1 # don't continue
}
try {
    Invoke-WebRequest -Uri $msStorePackagesUrl -OutFile $msStorePackagesFile
} catch {
    Write-Host "❖ Failed to download Microsoft Store package list:" -ForegroundColor Red
    Write-Host "- $_" -ForegroundColor Red
}
try {
    Invoke-WebRequest -Uri $psModulesUrl -OutFile $psModulesFile
} catch {
    Write-Host "❖ Failed to download PSModules list:" -ForegroundColor Red
    Write-Host "- $_" -ForegroundColor Red
}

#####
## installation functions
#####
function Install-WingetPackages {
    param (
        [string]$filePath
    )

    if (-Not (Test-Path $filePath)) {
        Write-Host "❖ Installation failed: the Winget package list was not found:" -ForegroundColor Red
        Write-Host "❖ $filePath" -ForegroundColor Red
        Write-Host "❖ And the script cannot continue." -ForegroundColor Red
        exit 1
    }

    $packages = Get-Content $filePath | Where-Object { -Not ($_ -match '^\s*$') -and -Not ($_ -match '^#') }

    foreach ($package in $packages) {
        winget install --id $package --accept-source-agreements --accept-package-agreements -e
    }
}
function Install-PSModules {
    param (
        [string]$filePath
    )

    if (-Not (Test-Path $filePath)) {
        Write-Host "❖ PSModules package list file not found: $filePath" -ForegroundColor Red
        return
    }

    $modules = Get-Content $filePath | Where-Object { -Not ($_ -match '^\s*$') -and -Not ($_ -match '^#') }

    foreach ($module in $modules) {
        if (!(Get-Module -ListAvailable -Name $module)) {
            try {
                Install-Module -Name $module -Scope CurrentUser -Force -AllowClobber
            }
            catch {
                Write-Host "❖ Failed to install PSModule/s:" -ForegroundColor Red
                Write-Host "- ${module}: $_" -ForegroundColor Red
            }
        }
    }
}

#####
## install packages
#####
Install-WingetPackages -filePath $wingetPackagesFile
Install-WingetPackages -filePath $msStorePackagesFile
Install-PSModules -filePath $psModulesFile

#####
## cleanup temporary files
#####
Remove-Item $wingetPackagesFile -ErrorAction SilentlyContinue
Remove-Item $msStorePackagesFile -ErrorAction SilentlyContinue
Remove-Item $psModulesFile -ErrorAction SilentlyContinue

#####
## copy pwsh profile to documents
#####
New-Item -Path "$env:USERPROFILE\Documents\PowerShell" -ItemType Directory -Force; curl.exe -o "$env:USERPROFILE\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1" "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/Microsoft.PowerShell_profile.ps1"
New-Item -Path "$env:USERPROFILE\Documents\WindowsPowerShell" -ItemType Directory -Force; curl.exe -o "$env:USERPROFILE\Documents\PowerShell\Microsoft.PowerShell_profile.ps1" "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/Microsoft.PowerShell_profile.ps1"
New-Item -Path "$env:USERPROFILE\Documents\WindowsPowerShell" -ItemType Directory -Force; curl.exe -o "$env:USERPROFILE\Documents\PowerShell\Microsoft.VSCode_profile.ps1" "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/Microsoft.PowerShell_profile.ps1"

## end messages
Write-Host "❖ Execute:"
Write-Host "❖ irm win.jfa.dev/post-install | iex" -ForegroundColor Green
Write-Host "❖ In a new, non-admin elevated PowerShell window to launch the post-installation script that will finish the installation."
