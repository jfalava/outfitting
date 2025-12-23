## init
Write-Host "❖ Checking Winget terms of use..." -ForegroundColor Cyan
winget --info

#####
## variable setting
#####
# Using base profile by default - includes core packages, runtimes, and utilities
# For other profiles, use: irm win.jfa.dev/dev | iex OR irm win.jfa.dev/gaming | iex
# Available profiles: base, dev, gaming, work, full
# Custom combinations: irm win.jfa.dev/base+dev+gaming | iex
$wingetPackagesUrl = "https://win.jfa.dev/packages/base"
$wingetPackagesFile = "$env:TEMP\winget.txt"

#####
# download the package list
######
try {
    Invoke-WebRequest -Uri $wingetPackagesUrl -OutFile $wingetPackagesFile
    Write-Host "❖ Package list downloaded." -ForegroundColor Green
} catch {
    Write-Host "❖ Failed to download package list:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
    exit 1 # don't continue
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
        [string[]]$modules
    )

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

#####
## install packages
#####
Install-WingetPackages -filePath $wingetPackagesFile

# Install PowerShell modules
$psModules = @("PSReadLine")
Install-PSModules -modules $psModules

#####
## install and configure OpenSSH Server for Tailscale SSH
#####
Write-Host "`n❖ Installing OpenSSH Server..." -ForegroundColor Cyan
try {
    # Check if OpenSSH Server is already installed
    $sshServerInstalled = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'

    if ($sshServerInstalled.State -ne "Installed") {
        # Install OpenSSH Server
        Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
        Write-Host "❖ OpenSSH Server installed successfully." -ForegroundColor Green
    } else {
        Write-Host "❖ OpenSSH Server is already installed." -ForegroundColor Yellow
    }

    # Start the sshd service
    Start-Service sshd
    Write-Host "❖ OpenSSH Server service started." -ForegroundColor Green

    # Set sshd service to start automatically
    Set-Service -Name sshd -StartupType 'Automatic'
    Write-Host "❖ OpenSSH Server service set to start automatically." -ForegroundColor Green

    # Confirm the firewall rule is configured (it should be created automatically)
    $firewallRule = Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue
    if ($null -eq $firewallRule) {
        New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
        Write-Host "❖ Firewall rule for SSH created." -ForegroundColor Green
    } else {
        Write-Host "❖ Firewall rule for SSH already exists." -ForegroundColor Yellow
    }
} catch {
    Write-Host "❖ Failed to install/configure OpenSSH Server:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
    Write-Host "❖ You may need to install it manually or run the script as Administrator." -ForegroundColor Yellow
}

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
    $regFilePaths = $treeItems | Where-Object { $_.path -like "settings-files/windows/registry/*.reg" -and $_.type -eq "blob" } | ForEach-Object { $_.path }

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

#####
## copy pwsh profile to documents
#####
$masterProfilePath = "$env:USERPROFILE\Documents\PowerShell\Microsoft.PowerShell_profile.ps1"
$slaveProfiles = @(
    "$env:USERPROFILE\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1",
    "$env:USERPROFILE\Documents\PowerShell\Microsoft.VSCode_profile.ps1"
)
$profileUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/dotfiles/Microsoft.PowerShell_profile.ps1"

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

#####
## install bun global packages from bun.txt
#####
if (Get-Command bun -ErrorAction SilentlyContinue) {
    Write-Host "`n❖ Installing Bun global packages..." -ForegroundColor Cyan

    $bunPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/bun.txt"
    $bunPackagesFile = "$env:TEMP\bun-packages.txt"

    try {
        Invoke-WebRequest -Uri $bunPackagesUrl -OutFile $bunPackagesFile -ErrorAction Stop
        Write-Host "❖ Bun packages list downloaded." -ForegroundColor Green

        # Validate that the file is not empty
        if (-Not (Test-Path $bunPackagesFile) -or (Get-Item $bunPackagesFile).Length -eq 0) {
            Write-Host "❖ Warning: Bun package list is empty" -ForegroundColor Yellow
        } else {
            $bunPackages = Get-Content $bunPackagesFile | Where-Object { -Not ($_ -match '^\s*$') -and -Not ($_ -match '^#') }

            foreach ($package in $bunPackages) {
                try {
                    bun install -g $package
                    Write-Host "❖ Installed Bun package: $package" -ForegroundColor Green
                } catch {
                    Write-Host "❖ Failed to install Bun package: ${package}" -ForegroundColor Red
                    Write-Host "  - $_" -ForegroundColor Red
                }
            }
        }

        Remove-Item $bunPackagesFile -ErrorAction SilentlyContinue
    } catch {
        Write-Host "❖ Failed to fetch Bun packages list: $_" -ForegroundColor Red
        Write-Host "❖ Skipping Bun package installations." -ForegroundColor Yellow
    }
} else {
    Write-Host "`n❖ Bun not found, skipping global package installations." -ForegroundColor Yellow
    Write-Host "  - To install Bun, use: irm win.jfa.dev/dev | iex" -ForegroundColor Cyan
}

## end messages
Write-Host "`n"
Write-Host "❖ Installation complete" -ForegroundColor Green
Write-Host "`n"
