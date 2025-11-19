## init
Write-Host "❖ Checking Winget terms of use..." -ForegroundColor Cyan
winget --info

#####
## variable setting
#####
$wingetPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-windows/winget.txt"
$msStorePackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-windows/msstore-winget.txt"
$psModulesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-windows/pwsh-modules.txt"
$wingetPackagesFile = "$env:TEMP\winget.txt"
$msStorePackagesFile = "$env:TEMP\msstore-winget.txt"
$psModulesFile = "$env:TEMP\psmodules.txt"

#####
# download the package lists
######
try {
    Invoke-WebRequest -Uri $wingetPackagesUrl -OutFile $wingetPackagesFile
    Write-Host "❖ Winget packages list downloaded." -ForegroundColor Green
} catch {
    Write-Host "❖ Failed to download Winget package list:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
    exit 1 # don't continue
}
try {
    Invoke-WebRequest -Uri $msStorePackagesUrl -OutFile $msStorePackagesFile
    Write-Host "❖ Microsoft Store packages list downloaded." -ForegroundColor Green
} catch {
    Write-Host "❖ Failed to download Microsoft Store package list:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
}
try {
    Invoke-WebRequest -Uri $psModulesUrl -OutFile $psModulesFile
    Write-Host "❖ PowerShell modules list downloaded." -ForegroundColor Green
} catch {
    Write-Host "❖ Failed to download PowerShell modules list:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
}

#####
## installation functions
#####
function Install-WingetPackages {
    param (
        [string]$filePath
    )

    if (-Not (Test-Path $filePath)) {
        Write-Host "❖ Installation failed: the package list was not found:" -ForegroundColor Red
        Write-Host "  - $filePath" -ForegroundColor Red
        Write-Host "❖ And the script cannot continue." -ForegroundColor Red
        exit 1
    }

    $packages = Get-Content $filePath | Where-Object { -Not ($_ -match '^\s*$') -and -Not ($_ -match '^#') }

    foreach ($package in $packages) {
        try {
            winget install --id $package --accept-source-agreements --accept-package-agreements -e
            Write-Host "❖ Installed package: $package" -ForegroundColor Green
        } catch {
            Write-Host "❖ Failed to install package:" -ForegroundColor Red
            Write-Host "  - ${package}: $_" -ForegroundColor Red
            # Continue to next package
        }
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
                Write-Host "❖ Installed PowerShell module: $module" -ForegroundColor Green
            }
            catch {
                Write-Host "❖ Failed to install PowerShell module(s):" -ForegroundColor Red
                Write-Host "  - ${module}: $_" -ForegroundColor Red
            }
        } else {
            Write-Host "❖ PowerShell module already available: $module" -ForegroundColor Yellow
        }
    }
}
function Install-MsixPackage {
    param (
        [string]$url,
        [string]$packageName,
        [string]$appxIdentity = $null
    )

    # Pre-check if package is already installed
    if ($appxIdentity) {
        $existingPackage = Get-AppxPackage -Name $appxIdentity -ErrorAction SilentlyContinue
        if ($existingPackage) {
            Write-Host "❖ MSIX package already installed: $appxIdentity" -ForegroundColor Yellow
            return
        }
    }

    $tempMsixPath = "$env:TEMP\$packageName"
    try {
        Write-Host "❖ Downloading MSIX package: $packageName" -ForegroundColor Cyan
        Invoke-WebRequest -Uri $url -OutFile $tempMsixPath -ErrorAction Stop
        Write-Host "❖ Downloaded MSIX package to: $tempMsixPath" -ForegroundColor Green

        Write-Host "❖ Installing MSIX package: $packageName" -ForegroundColor Cyan
        Add-AppxPackage -Path $tempMsixPath -ErrorAction Stop
        Write-Host "❖ Installed MSIX package: $packageName" -ForegroundColor Green
    }
    catch {
        Write-Host "❖ Failed to install MSIX package:" -ForegroundColor Red
        Write-Host "  - ${packageName}: $_" -ForegroundColor Red
    }
    finally {
        if (Test-Path $tempMsixPath) {
            Remove-Item $tempMsixPath -ErrorAction SilentlyContinue
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
## install MSIX packages
#####
Install-MsixPackage -url "https://static.jfa.dev/git/lfs/WhatsAppDesktop_2.2545.5.0.Msixbundle" -packageName "WhatsAppDesktop.Msixbundle" -appxIdentity "5319275A.WhatsAppDesktop"

#####
## install registry tweaks interactively (dynamic discovery via GitHub API)
#####
$baseRegUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main"
$githubApiUrl = "https://api.github.com/repos/jfalava/outfitting/git/trees/main?recursive=1"
$regFilePaths = @()
$validRegFiles = @()

try {
    $apiResponse = Invoke-RestMethod -Uri $githubApiUrl -Method Get -Headers @{ "User-Agent" = "PowerShellScript" }
    $treeItems = $apiResponse.tree
    $regFilePaths = $treeItems | Where-Object { $_.path -like "windows-registry/*.reg" -and $_.type -eq "blob" } | ForEach-Object { $_.path }

    if ($regFilePaths.Count -gt 0) {
        Write-Host "`n❖ Discovered $($regFilePaths.Count) registry tweak(s) from GitHub repo:" -ForegroundColor Cyan
        foreach ($path in $regFilePaths) {
            $fileName = Split-Path $path -Leaf
            Write-Host "  - $fileName" -ForegroundColor Yellow
        }

        # Fetch content for each discovered file
        foreach ($path in $regFilePaths) {
            $url = "$baseRegUrl/$path"
            try {
                $response = Invoke-WebRequest -Uri $url -ErrorAction Stop
                if ($response.StatusCode -eq 200) {
                    $fileName = Split-Path $path -Leaf
                    $validRegFiles += [PSCustomObject]@{ Name = $fileName; Content = $response.Content; Url = $url; Path = $path }
                }
            } catch {
                Write-Host "❖ Failed to fetch registry file ${path}: $_" -ForegroundColor Red
            }
        }

        if ($validRegFiles.Count -gt 0) {
            Write-Host "`n❖ Found $($validRegFiles.Count) valid registry tweak(s) to install:" -ForegroundColor Cyan
            foreach ($file in $validRegFiles) {
                Write-Host "  - $($file.Name)" -ForegroundColor Yellow
            }
            $globalChoice = Read-Host "`nChoose: (A)ll, (N)one, or (R)eview each? [A/N/R] (default: A)"
            $globalChoice = if ([string]::IsNullOrWhiteSpace($globalChoice)) { "A" } else { $globalChoice.ToUpper() }

            switch ($globalChoice) {
                "A" {
                    foreach ($file in $validRegFiles) {
                        $tempRegPath = "$env:TEMP\$($file.Name)"
                        $file.Content | Out-File -FilePath $tempRegPath -Encoding UTF8
                        & reg import $tempRegPath
                        if ($LASTEXITCODE -eq 0) {
                            Write-Host "❖ Imported registry tweak: $($file.Name)" -ForegroundColor Green
                        } else {
                            Write-Host "❖ Failed to import registry tweak: $($file.Name)" -ForegroundColor Red
                        }
                        Remove-Item $tempRegPath -ErrorAction SilentlyContinue
                    }
                }
                "N" {
                    Write-Host "❖ Skipping all registry tweaks." -ForegroundColor Yellow
                }
                "R" {
                    foreach ($file in $validRegFiles) {
                        Write-Host "`n❖ --- $($file.Name) ---" -ForegroundColor Cyan
                        $file.Content | ForEach-Object { Write-Host $_ -ForegroundColor Gray }
                        $perChoice = Read-Host "Install this tweak? [Y/N] (default: N)"
                        $perChoice = if ([string]::IsNullOrWhiteSpace($perChoice)) { "N" } else { $perChoice.ToUpper() }
                        if ($perChoice -eq "Y") {
                            $tempRegPath = "$env:TEMP\$($file.Name)"
                            $file.Content | Out-File -FilePath $tempRegPath -Encoding UTF8
                            & reg import $tempRegPath
                            if ($LASTEXITCODE -eq 0) {
                                Write-Host "❖ Imported registry tweak: $($file.Name)" -ForegroundColor Green
                            } else {
                                Write-Host "❖ Failed to import registry tweak: $($file.Name)" -ForegroundColor Red
                            }
                            Remove-Item $tempRegPath -ErrorAction SilentlyContinue
                        } else {
                            Write-Host "❖ Skipped registry tweak: $($file.Name)" -ForegroundColor Yellow
                        }
                    }
                }
                default {
                    Write-Host "❖ Invalid choice, defaulting to All." -ForegroundColor Yellow
                    foreach ($file in $validRegFiles) {
                        $tempRegPath = "$env:TEMP\$($file.Name)"
                        $file.Content | Out-File -FilePath $tempRegPath -Encoding UTF8
                        & reg import $tempRegPath
                        if ($LASTEXITCODE -eq 0) {
                            Write-Host "❖ Imported registry tweak: $($file.Name)" -ForegroundColor Green
                        } else {
                            Write-Host "❖ Failed to import registry tweak: $($file.Name)" -ForegroundColor Red
                        }
                        Remove-Item $tempRegPath -ErrorAction SilentlyContinue
                    }
                }
            }
        } else {
            Write-Host "❖ No valid .reg files fetched from discovered paths." -ForegroundColor Yellow
        }
    } else {
        Write-Host "❖ No .reg files discovered in windows-registry/ directory." -ForegroundColor Yellow
    }
} catch {
    Write-Host "❖ Failed to discover registry files via GitHub API: $_" -ForegroundColor Red
    Write-Host "❖ Skipping registry tweaks." -ForegroundColor Yellow
}

#####
## cleanup temporary files
#####
Remove-Item $wingetPackagesFile -ErrorAction SilentlyContinue
Remove-Item $msStorePackagesFile -ErrorAction SilentlyContinue
Remove-Item $psModulesFile -ErrorAction SilentlyContinue

#####
## copy pwsh profile to documents
#####
$masterProfilePath = "$env:USERPROFILE\Documents\PowerShell\Microsoft.PowerShell_profile.ps1"
$slaveProfiles = @(
    "$env:USERPROFILE\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1",
    "$env:USERPROFILE\Documents\PowerShell\Microsoft.VSCode_profile.ps1"
)
$profileUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/Microsoft.PowerShell_profile.ps1"

try {
    # create directories if needed
    New-Item -Path "$env:USERPROFILE\Documents\PowerShell" -ItemType Directory -Force | Out-Null
    New-Item -Path "$env:USERPROFILE\Documents\WindowsPowerShell" -ItemType Directory -Force | Out-Null

    # download master profile
    Invoke-WebRequest -Uri $profileUrl -OutFile $masterProfilePath
    Write-Host "❖ Downloaded master profile to: $masterProfilePath" -ForegroundColor Green

    # copy to slaves
    foreach ($slavePath in $slaveProfiles) {
        Copy-Item -Path $masterProfilePath -Destination $slavePath -Force
        Write-Host "❖ Copied profile to: $slavePath" -ForegroundColor Green
    }
} catch {
    Write-Host "❖ Failed to set up PowerShell profiles:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
    exit 1
}

## end messages
Write-Host "`n"
Write-Host "❖ Main installation complete." -ForegroundColor Green
Write-Host "❖ Execute in a new, non-admin PowerShell window:"
Write-Host "  - irm win.jfa.dev/post-install | iex" -ForegroundColor Green
