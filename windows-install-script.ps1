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
# download the files
######
try {
    Invoke-WebRequest -Uri $wingetPackagesUrl -OutFile $wingetPackagesFile
    Invoke-WebRequest -Uri $msStorePackagesUrl -OutFile $msStorePackagesFile
    Invoke-WebRequest -Uri $psModulesUrl -OutFile $psModulesFile
    Invoke-WebRequest -Uri $scoopPackagesUrl -OutFile $scoopPackagesFile
} catch {
    Write-Host "Failed to download package lists: $_" -ForegroundColor Red
    exit 1
}
# install packages from a given file
function Install-WingetPackages {
    param (
        [string]$filePath
    )

    if (-Not (Test-Path $filePath)) {
        Write-Host "File not found: $filePath" -ForegroundColor Red
        return
    }

    $packages = Get-Content $filePath | Where-Object { -Not ($_ -match '^\s*$') -and -Not ($_ -match '^#') }

    foreach ($package in $packages) {
        winget install --id $package --accept-source-agreements --accept-package-agreements -e
    }
}
#####
## function to install pwsh modules
#####
function Install-PSModules {
    param (
        [string]$filePath
    )

    if (-Not (Test-Path $filePath)) {
        Write-Host "File not found: $filePath" -ForegroundColor Red
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
                Write-Host "Failed to install ${module}: $_" -ForegroundColor Red
            }
        } else {
            Write-Host "✓ $module is already installed" -ForegroundColor Green
        }
    }
}

#####
## install Winget packages
#####
Install-WingetPackages -filePath $wingetPackagesFile

#####
## install Microsoft Store packages
#####
Install-WingetPackages -filePath $msStorePackagesFile

#####
## install PowerShell modules
#####
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
