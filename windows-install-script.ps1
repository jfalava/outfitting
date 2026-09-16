#############################################
###################### Windows Install Script
#############################################

param(
    [string]$OutfittingManifestBaseUrl = $env:OUTFITTING_MANIFEST_BASE_URL,
    [string]$OutfittingManifestRef = $env:OUTFITTING_MANIFEST_REF
)

############################## Initial Setup
$ErrorActionPreference = "Stop"
$script:hasErrors = $false
# Trap to catch all errors and prevent window closure
trap {
    Write-Host "`n❖ An unexpected error occurred:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
    $script:hasErrors = $true
    Continue
}
Write-Host "❖ Checking Winget terms of use..." -ForegroundColor Cyan
winget --info
############################################

########################### Variable setting
$outfittingInitialProfiles = @("base")
$outfittingManagerReleaseUrl = "https://github.com/jfalava/outfitting/releases/latest/download"
$outfittingManagerAsset = "outfitting-manager-windows-x64.zip"
$outfittingManagerEntry = "outfitting-manager.exe"
$outfittingManagerInstallPath = "$env:USERPROFILE\.local\bin\outfitting-manager.exe"
$outfittingStateRoot = if ([string]::IsNullOrWhiteSpace($env:OUTFITTING_STATE_ROOT)) {
    "$env:USERPROFILE\.config\outfitting"
} else {
    $env:OUTFITTING_STATE_ROOT
}

function Get-OutfittingManifestSource {
    param (
        [string]$BaseUrl,
        [string]$Ref
    )

    $resolvedBaseUrl = $BaseUrl
    $resolvedRef = $Ref
    $configPath = Join-Path $outfittingStateRoot "config.json"
    if (([string]::IsNullOrWhiteSpace($resolvedBaseUrl) -or [string]::IsNullOrWhiteSpace($resolvedRef)) -and (Test-Path -LiteralPath $configPath -PathType Leaf)) {
        try {
            $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
            if ([string]::IsNullOrWhiteSpace($resolvedBaseUrl)) {
                $resolvedBaseUrl = [string]$config.manifest.baseUrl
            }
            if ([string]::IsNullOrWhiteSpace($resolvedRef)) {
                $resolvedRef = [string]$config.manifest.ref
            }
        } catch {
            # The manager reports invalid config files during init.
        }
    }

    if ([string]::IsNullOrWhiteSpace($resolvedBaseUrl)) {
        $resolvedBaseUrl = "https://raw.githubusercontent.com/jfalava/outfitting"
    }
    if ([string]::IsNullOrWhiteSpace($resolvedRef)) {
        $resolvedRef = "main"
    }

    return [PSCustomObject]@{
        BaseUrl = $resolvedBaseUrl.TrimEnd("/")
        Ref = $resolvedRef
    }
}

function Get-OutfittingGitHubTreeUrl {
    param ([Parameter(Mandatory)]$Source)

    try {
        $uri = [Uri]$Source.BaseUrl
        if ($uri.Host -ne "raw.githubusercontent.com") {
            return $null
        }
        $segments = @($uri.AbsolutePath.Trim("/").Split("/") | Where-Object { $_.Length -gt 0 })
        if ($segments.Count -ne 2) {
            return $null
        }
        $encodedRef = [Uri]::EscapeDataString($Source.Ref)
        return "https://api.github.com/repos/$($segments[0])/$($segments[1])/git/trees/$encodedRef?recursive=1"
    } catch {
        return $null
    }
}

function Get-OutfittingWindowsRoute {
    param (
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Default
    )

    $route = $Default
    $configPath = Join-Path $outfittingStateRoot "config.json"
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        try {
            $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
            $property = $config.windows.PSObject.Properties[$Name]
            if ($null -ne $property -and -not [string]::IsNullOrWhiteSpace([string]$property.Value)) {
                $route = [string]$property.Value
            }
        } catch {
            # The manager reports invalid config files during init.
        }
    }
    return $route.Trim().Trim("/")
}
############################################

##################### Installation functions
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
                $script:hasErrors = $true
                Write-Host "❖ Failed to install PowerShell module(s):" -ForegroundColor Red
                Write-Host "  - ${module}: $_" -ForegroundColor Red
            }
        } else {
            Write-Host "❖ PowerShell module already available: $module" -ForegroundColor Yellow
        }
    }
}

function Install-OutfittingManager {
    $installDirectory = Split-Path -Parent $outfittingManagerInstallPath
    $temporaryArchive = Join-Path $env:TEMP "$outfittingManagerAsset.download"
    $temporaryChecksum = Join-Path $env:TEMP "$outfittingManagerAsset.sha256"
    $temporaryExtractDirectory = Join-Path $env:TEMP "outfitting-manager-extract"

    try {
        Write-Host "❖ Downloading outfitting-manager..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri "$outfittingManagerReleaseUrl/$outfittingManagerAsset" -OutFile $temporaryArchive
        Invoke-WebRequest -Uri "$outfittingManagerReleaseUrl/$outfittingManagerAsset.sha256" -OutFile $temporaryChecksum

        $expectedChecksum = ((Get-Content -LiteralPath $temporaryChecksum -Raw).Trim() -split "\s+")[0]
        $actualChecksum = (Get-FileHash -LiteralPath $temporaryArchive -Algorithm SHA256).Hash
        if ($actualChecksum -ne $expectedChecksum) {
            throw "Checksum mismatch for $outfittingManagerAsset."
        }

        if (Test-Path -LiteralPath $temporaryExtractDirectory) {
            Remove-Item -LiteralPath $temporaryExtractDirectory -Recurse -Force -ErrorAction Stop
        }
        New-Item -Path $temporaryExtractDirectory -ItemType Directory -Force | Out-Null
        Expand-Archive -LiteralPath $temporaryArchive -DestinationPath $temporaryExtractDirectory -Force

        $extractedBinary = Join-Path $temporaryExtractDirectory $outfittingManagerEntry
        if (-not (Test-Path -LiteralPath $extractedBinary -PathType Leaf)) {
            throw "Archive does not contain $outfittingManagerEntry."
        }

        New-Item -Path $installDirectory -ItemType Directory -Force | Out-Null
        Move-Item -LiteralPath $extractedBinary -Destination $outfittingManagerInstallPath -Force
        Write-Host "❖ Installed outfitting-manager: $outfittingManagerInstallPath" -ForegroundColor Green
    } catch {
        $script:hasErrors = $true
        Write-Host "❖ Failed to install outfitting-manager:" -ForegroundColor Red
        Write-Host "  - $_" -ForegroundColor Red
    } finally {
        Remove-Item -LiteralPath $temporaryArchive -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $temporaryChecksum -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $temporaryExtractDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-OutfittingManager {
    param ([Parameter(Mandatory)][string[]]$Arguments)

    if (-not (Test-Path -LiteralPath $outfittingManagerInstallPath -PathType Leaf)) {
        throw "outfitting-manager was not installed at $outfittingManagerInstallPath."
    }

    & $outfittingManagerInstallPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "outfitting-manager $($Arguments -join ' ') exited with code $LASTEXITCODE."
    }
}
############################################

################ Install manager and the selected WinGet baseline
Install-OutfittingManager
try {
    $setupArguments = @(
        "setup",
        "--profile",
        ($outfittingInitialProfiles -join ","),
        "--winget-only",
        "--no-push"
    )
    if (-not [string]::IsNullOrWhiteSpace($OutfittingManifestBaseUrl)) {
        $setupArguments += @("--manifest-base-url", $OutfittingManifestBaseUrl)
    }
    if (-not [string]::IsNullOrWhiteSpace($OutfittingManifestRef)) {
        $setupArguments += @("--manifest-ref", $OutfittingManifestRef)
    }
    Invoke-OutfittingManager -Arguments $setupArguments
} catch {
    $script:hasErrors = $true
    Write-Host "❖ Failed to install the WinGet baseline through outfitting-manager:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
}
############################################

################# Install PowerShell modules
$psModules = @("PSReadLine")
Install-PSModules -modules $psModules
############################################

####### Install and configure OpenSSH Server
Write-Host "`n❖ Installing OpenSSH Server from GitHub..." -ForegroundColor Cyan
try {
    # Check if sshd service already exists
    $sshdService = Get-Service -Name sshd -ErrorAction SilentlyContinue

    if ($null -eq $sshdService) {
        Write-Host "❖ Downloading latest OpenSSH Server from GitHub..." -ForegroundColor Cyan

        # Get latest release info from GitHub API
        $apiUrl = "https://api.github.com/repos/PowerShell/Win32-OpenSSH/releases/latest"
        $releaseInfo = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "PowerShellScript" }

        # Find the Win64 package
        $asset = $releaseInfo.assets | Where-Object { $_.name -like "*Win64.zip" } | Select-Object -First 1

        if ($null -eq $asset) {
            throw "Could not find Win64 package in latest release"
        }

        $downloadUrl = $asset.browser_download_url
        $zipPath = "$env:TEMP\OpenSSH-Win64.zip"
        $extractPath = "$env:TEMP\OpenSSH-Win64"

        # Download the package
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -ErrorAction Stop
        Write-Host "❖ Downloaded OpenSSH Server v$($releaseInfo.tag_name)" -ForegroundColor Green

        # Extract the package
        Expand-Archive -Path $zipPath -DestinationPath $env:TEMP -Force

        # Install OpenSSH Server
        $installScript = Join-Path $extractPath "OpenSSH-Win64\install-sshd.ps1"
        if (Test-Path $installScript) {
            & powershell.exe -ExecutionPolicy Bypass -File $installScript
            Write-Host "❖ OpenSSH Server installed successfully." -ForegroundColor Green
        } else {
            throw "Install script not found at: $installScript"
        }

        # Cleanup
        Remove-Item $zipPath -ErrorAction SilentlyContinue
        Remove-Item $extractPath -Recurse -ErrorAction SilentlyContinue
    } else {
        Write-Host "❖ OpenSSH Server is already installed." -ForegroundColor Yellow
    }

    # Start the sshd service
    Start-Service sshd -ErrorAction SilentlyContinue
    Write-Host "❖ OpenSSH Server service started." -ForegroundColor Green

    # Set sshd service to start automatically
    Set-Service -Name sshd -StartupType 'Automatic'
    Write-Host "❖ OpenSSH Server service set to start automatically." -ForegroundColor Green

    # Confirm the firewall rule is configured
    $firewallRule = Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue
    if ($null -eq $firewallRule) {
        New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
        Write-Host "❖ Firewall rule for SSH created." -ForegroundColor Green
    } else {
        Write-Host "❖ Firewall rule for SSH already exists." -ForegroundColor Yellow
    }
} catch {
    $script:hasErrors = $true
    Write-Host "❖ Failed to install/configure OpenSSH Server:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
    Write-Host "❖ You may need to install it manually or run the script as Administrator." -ForegroundColor Yellow
}
############################################

###### Install registry tweaks interactively
$manifestSource = Get-OutfittingManifestSource -BaseUrl $OutfittingManifestBaseUrl -Ref $OutfittingManifestRef
$baseRegUrl = "$($manifestSource.BaseUrl)/$($manifestSource.Ref)"
$githubApiUrl = Get-OutfittingGitHubTreeUrl -Source $manifestSource
$regFilePaths = @()
$validRegFiles = @()
try {
    if ($null -eq $githubApiUrl) {
        throw "Registry discovery requires a GitHub raw manifest source."
    }
    $apiResponse = Invoke-RestMethod -Uri $githubApiUrl -Method Get -Headers @{ "User-Agent" = "PowerShellScript" }
    $treeItems = $apiResponse.tree
    $registryRoute = Get-OutfittingWindowsRoute -Name "registryPath" -Default "system/windows/registry"
    $regFilePaths = $treeItems | Where-Object { $_.path -like "$registryRoute/*.reg" -and $_.type -eq "blob" } | ForEach-Object { $_.path }

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
                $script:hasErrors = $true
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
                            $script:hasErrors = $true
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
                                $script:hasErrors = $true
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
                            $script:hasErrors = $true
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
        Write-Host "❖ No .reg files discovered in $registryRoute/ directory." -ForegroundColor Yellow
    }
} catch {
    if ($null -eq $githubApiUrl) {
        Write-Host "❖ Registry discovery requires a GitHub raw manifest source; skipping registry tweaks." -ForegroundColor Yellow
    } else {
        $script:hasErrors = $true
        Write-Host "❖ Failed to discover registry files via GitHub API: $_" -ForegroundColor Red
        Write-Host "❖ Skipping registry tweaks." -ForegroundColor Yellow
    }
}
############################################

########## Link PowerShell profiles to the sparsely fetched source
$profileRoute = Get-OutfittingWindowsRoute -Name "powershellProfilePath" -Default "dotfiles/Microsoft.PowerShell_profile.ps1"
$profileSourcePath = Join-Path $outfittingStateRoot (Join-Path "manifests" ($profileRoute -replace "/", "\"))
try {
    if (-not (Test-Path -LiteralPath $profileSourcePath -PathType Leaf)) {
        throw "outfitting-manager did not materialize the PowerShell profile at $profileSourcePath."
    }

    $profilePaths = @(
        "$env:USERPROFILE\Documents\PowerShell\Microsoft.PowerShell_profile.ps1",
        "$env:USERPROFILE\Documents\PowerShell\Microsoft.VSCode_profile.ps1",
        "$env:USERPROFILE\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1"
    )
    $backupTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"

    foreach ($profilePath in $profilePaths) {
        $backupPath = $null
        $profileDirectory = Split-Path -Parent $profilePath
        New-Item -Path $profileDirectory -ItemType Directory -Force | Out-Null

        $existingProfile = Get-Item -LiteralPath $profilePath -Force -ErrorAction SilentlyContinue
        if ($null -ne $existingProfile) {
            $existingTarget = $existingProfile.Target | Select-Object -First 1
            if ($existingProfile.LinkType -eq "SymbolicLink" -and $existingTarget) {
                if (-Not [System.IO.Path]::IsPathRooted($existingTarget)) {
                    $existingTarget = Join-Path $profileDirectory $existingTarget
                }

                if ([System.IO.Path]::GetFullPath($existingTarget) -eq $profileSourcePath) {
                    Write-Host "❖ PowerShell profile already linked: $profilePath" -ForegroundColor Yellow
                    continue
                }
            }

            $backupPath = "$profilePath.backup-$backupTimestamp"
            Move-Item -LiteralPath $profilePath -Destination $backupPath
            Write-Host "❖ Backed up existing profile to: $backupPath" -ForegroundColor Yellow
        }

        & cmd.exe /d /c mklink "$profilePath" "$profileSourcePath" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            if ($null -ne $backupPath -and -Not (Test-Path -LiteralPath $profilePath)) {
                Move-Item -LiteralPath $backupPath -Destination $profilePath
            }
            throw "mklink failed for $profilePath with exit code $LASTEXITCODE."
        }

        Write-Host "❖ Linked PowerShell profile to cached GitHub source: $profilePath" -ForegroundColor Green
    }
} catch {
    $script:hasErrors = $true
    Write-Host "❖ Failed to link PowerShell profiles:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
    Write-Host "❖ Confirm the manager completed sync and Windows Developer Mode is enabled." -ForegroundColor Yellow
}
############################################

############################### End messages
Write-Host "`n"
if ($script:hasErrors) {
    Write-Host "❖ Installation completed with some errors" -ForegroundColor Yellow
    Write-Host "  - Please review the error messages above" -ForegroundColor Yellow
} else {
    Write-Host "❖ Installation complete" -ForegroundColor Green
}
Write-Host "`n"
Write-Host "Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
############################################
