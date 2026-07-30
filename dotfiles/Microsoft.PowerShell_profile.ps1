# -------------------------------
# Paths
# -------------------------------
$pathList = @(
    "C:\bin"
    "C:\Program Files\Go\bin",
    "$env:USERPROFILE\scoop",
    "$env:LOCALAPPDATA\pnpm\",
    "$env:USERPROFILE\.bun\bin",
    "$env:USERPROFILE\.local\share\",
    "$env:USERPROFILE\.local\bin\",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links"
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages"
)
foreach ($path in $pathList) {
    if ($env:PATH -notlike "*$path*") {
        $env:PATH += ";$path"
    }
}

# -------------------------------
# ENV
# -------------------------------
$env:BUN_INSTALL = "$env:USERPROFILE\.bun"
$env:PNPM_HOME = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\"

# -------------------------------
# History Configuration
# -------------------------------
# PSReadLine owns persistent history. Do not reuse its text history file for
# another format: older versions of this profile wrote CLIXML to the same path,
# which PSReadLine then displayed as corrupted commands.
if (Get-Module -ListAvailable -Name PSReadLine) {
    Import-Module PSReadLine -ErrorAction Stop
    Set-PSReadLineOption -HistorySaveStyle SaveIncrementally -MaximumHistoryCount 10000
}

# -------------------------------
# Aliases
# -------------------------------
function ezals {
  eza --color=always --long --git --bytes --icons=always
}
Set-Alias l ezals

function reloadprofile {
  . $PROFILE
}
Set-Alias reload reloadprofile

function whichwin {
    param (
        [string]$name
    )
    Get-Command $name | Select-Object -ExpandProperty Definition
}
Set-Alias which whichwin

function killwsl {
  wsl --shutdown
}
Set-Alias wslk killwsl

# -------------------------------
# Functions
# -------------------------------

function Get-OutfittingRepo {
    if (-not [string]::IsNullOrWhiteSpace($env:OUTFITTING_REPO)) {
        $repoPath = $env:OUTFITTING_REPO
    } else {
        $configFile = Join-Path $env:USERPROFILE ".config\outfitting\repo-path"
        if (Test-Path -LiteralPath $configFile -PathType Leaf) {
            $repoPath = (Get-Content -LiteralPath $configFile -Raw -ErrorAction Stop).Trim()
        } else {
            $repoPath = Join-Path $env:USERPROFILE ".config\outfitting\repo"
        }
    }

    if ([string]::IsNullOrWhiteSpace($repoPath) -or -not (Test-Path -LiteralPath $repoPath -PathType Container)) {
        throw "Outfitting repository not found at '$repoPath'. Run Set-OutfittingRepo with the local checkout path."
    }

    return (Resolve-Path -LiteralPath $repoPath -ErrorAction Stop).Path
}

function Initialize-OutfittingManagerLink {
    $repoPath = Get-OutfittingRepo
    $managerSourcePath = Join-Path $repoPath "manager\cli\dist\outfitting-manager-cli-windows-x64.exe"
    if (-not (Test-Path -LiteralPath $managerSourcePath -PathType Leaf)) {
        Write-Warning "Outfitting manager is not built at '$managerSourcePath'. Run 'bun run --cwd manager/cli build:windows-x64'."
        return
    }
    $managerSourcePath = (Resolve-Path -LiteralPath $managerSourcePath -ErrorAction Stop).Path

    $managerLinkDirectory = "C:\bin"
    $managerLinkPath = Join-Path $managerLinkDirectory "outfitting-manager.exe"
    $existingManager = Get-Item -LiteralPath $managerLinkPath -Force -ErrorAction SilentlyContinue
    if ($null -ne $existingManager) {
        if ($existingManager.LinkType -ne "SymbolicLink") {
            Write-Warning "Cannot link outfitting-manager because a non-symlink already exists at '$managerLinkPath'."
            return
        }

        $existingTarget = $existingManager.Target | Select-Object -First 1
        if ($existingTarget -and -not [System.IO.Path]::IsPathRooted($existingTarget)) {
            $existingTarget = Join-Path $managerLinkDirectory $existingTarget
        }
        if ($existingTarget -and [System.IO.Path]::GetFullPath($existingTarget) -eq $managerSourcePath) {
            return
        }

        Remove-Item -LiteralPath $managerLinkPath -Force
    }

    New-Item -Path $managerLinkDirectory -ItemType Directory -Force | Out-Null
    & cmd.exe /d /c mklink "$managerLinkPath" "$managerSourcePath" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "mklink failed for '$managerLinkPath' with exit code $LASTEXITCODE."
    }
}

try {
    Initialize-OutfittingManagerLink
} catch {
    Write-Warning "Could not initialize the outfitting manager link: $_"
}

function Push-OutfittingLockfile {
    param(
        [Parameter(Mandatory = $true)][string]$Machine,
        [Parameter(Mandatory = $true)][string]$Kind,
        [Parameter(Mandatory = $true)][string]$Path
    )

    if (-not (Get-Command outfitting-manager -ErrorAction SilentlyContinue)) {
        $repoPath = Get-OutfittingRepo
        throw "outfitting-manager is not built or linked. Run 'bun run --cwd $repoPath\manager\cli build:windows-x64' and reload the profile."
    }

    & outfitting-manager lockfiles push $Machine $Kind $Path
    if ($LASTEXITCODE -ne 0) {
        throw "outfitting-manager lockfiles push exited with code $LASTEXITCODE"
    }
}

function Set-OutfittingRepo {
    [CmdletBinding(SupportsShouldProcess)]
    param ([Parameter(Mandatory)][string]$Path)

    $repoPath = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
    if (-not (Test-Path -LiteralPath $repoPath -PathType Container)) {
        throw "Outfitting repository path is not a directory: $repoPath"
    }

    $configDirectory = Join-Path $env:USERPROFILE ".config\outfitting"
    $configFile = Join-Path $configDirectory "repo-path"
    if ($PSCmdlet.ShouldProcess($configFile, "Set outfitting repository path to '$repoPath'")) {
        $null = New-Item -ItemType Directory -Path $configDirectory -Force
        [IO.File]::WriteAllText($configFile, $repoPath, [Text.UTF8Encoding]::new($false))
        Write-Host "Outfitting repository path set to: $repoPath" -ForegroundColor Green
    }
}

function Save-OutfittingScoopInventory {
    [CmdletBinding()]
    param ()

    if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
        throw "Scoop is not installed or not available in PATH."
    }

    Write-Host "❖ Saving Scoop Inventory" -ForegroundColor Cyan
    $snapshotPath = Join-Path ([System.IO.Path]::GetTempPath()) "outfitting-scoop-inventory-$PID.json"
    try {
        $json = & scoop export 2>$null | Out-String
        if ($LASTEXITCODE -ne 0) { throw "scoop export exited with code $LASTEXITCODE" }

        try {
            $state = $json | ConvertFrom-Json -ErrorAction Stop
        } catch {
            throw "Unable to parse scoop export output: $($_.Exception.Message)"
        }

        $inventory = [ordered]@{
            format = "outfitting-scoop-inventory-v1"
            apps = @(
                $state.apps |
                    Sort-Object Name, Source |
                    ForEach-Object {
                        [ordered]@{
                            Name = [string]$_.Name
                            Source = [string]$_.Source
                            Version = [string]$_.Version
                            Info = [string]$_.Info
                        }
                    }
            )
            buckets = @(
                $state.buckets |
                    Sort-Object Name |
                    ForEach-Object {
                        [ordered]@{
                            Name = [string]$_.Name
                            Source = [string]$_.Source
                        }
                    }
            )
        }

        $content = $inventory | ConvertTo-Json -Depth 5
        [IO.File]::WriteAllText(
            $snapshotPath,
            "$content$([Environment]::NewLine)",
            [Text.UTF8Encoding]::new($false)
        )
        Push-OutfittingLockfile `
            -Machine "jfalava:x64-windows" `
            -Kind "scoop-inventory" `
            -Path $snapshotPath
    }
    finally {
        Remove-Item -LiteralPath $snapshotPath -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Scoop inventory stored successfully." -ForegroundColor Green
}

function Save-OutfittingBunGlobalInventory {
    [CmdletBinding()]
    param ()

    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        throw "Bun is not installed or not available in PATH."
    }

    Write-Host "❖ Saving Global Bun Package Inventory" -ForegroundColor Cyan
    $snapshotPath = Join-Path ([System.IO.Path]::GetTempPath()) "outfitting-bun-global-inventory-$PID.json"
    try {
        $globalBinPath = (& bun pm bin -g | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) { throw "bun pm bin exited with code $LASTEXITCODE" }
        if (-not $globalBinPath) { throw "bun pm bin returned an empty global bin path" }

        $manifestPath = Join-Path (Split-Path -Parent $globalBinPath) "install\global\package.json"
        if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
            throw "Global Bun package manifest not found: $manifestPath"
        }

        try {
            $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json -ErrorAction Stop
        } catch {
            throw "Unable to parse the global Bun package manifest: $($_.Exception.Message)"
        }

        $inventory = [ordered]@{
            format = "outfitting-bun-global-inventory-v1"
            packages = @(
                $manifest.dependencies.PSObject.Properties.Name |
                    Sort-Object
            )
        }
        $content = $inventory | ConvertTo-Json -Depth 3
        [IO.File]::WriteAllText(
            $snapshotPath,
            "$content$([Environment]::NewLine)",
            [Text.UTF8Encoding]::new($false)
        )
        Push-OutfittingLockfile `
            -Machine "jfalava:x64-windows" `
            -Kind "bun-global-inventory" `
            -Path $snapshotPath
    }
    finally {
        Remove-Item -LiteralPath $snapshotPath -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Global Bun package inventory stored successfully." -ForegroundColor Green
}

function Save-OutfittingPowerShellInventory {
    [CmdletBinding()]
    param ()

    if (-not (Get-Command Get-InstalledModule -ErrorAction SilentlyContinue)) {
        throw "PowerShellGet is not installed or Get-InstalledModule is not available."
    }

    Write-Host "❖ Saving PowerShell Package Inventory" -ForegroundColor Cyan
    $snapshotPath = Join-Path ([System.IO.Path]::GetTempPath()) "outfitting-powershell-inventory-$PID.json"
    try {
        $moduleNames = @(
            Get-InstalledModule -ErrorAction Stop |
                ForEach-Object { [string]$_.Name } |
                Sort-Object -Unique
        )
        $installedModules = foreach ($moduleName in $moduleNames) {
            Get-InstalledModule -Name $moduleName -AllVersions -ErrorAction Stop
        }
        $modules = @(
            $installedModules |
                Sort-Object Name, Version |
                ForEach-Object {
                    [ordered]@{
                        Name = [string]$_.Name
                        Version = [string]$_.Version
                        Repository = [string]$_.Repository
                    }
                }
        )

        $scripts = @()
        if (Get-Command Get-InstalledScript -ErrorAction SilentlyContinue) {
            $scripts = @(
                Get-InstalledScript -ErrorAction Stop |
                    Sort-Object Name, Version |
                    ForEach-Object {
                        [ordered]@{
                            Name = [string]$_.Name
                            Version = [string]$_.Version
                            Repository = [string]$_.Repository
                        }
                    }
            )
        }

        $inventory = [ordered]@{
            format = "outfitting-powershell-inventory-v1"
            modules = $modules
            scripts = $scripts
        }
        $content = $inventory | ConvertTo-Json -Depth 4
        [IO.File]::WriteAllText(
            $snapshotPath,
            "$content$([Environment]::NewLine)",
            [Text.UTF8Encoding]::new($false)
        )
        Push-OutfittingLockfile `
            -Machine "jfalava:x64-windows" `
            -Kind "powershell-inventory" `
            -Path $snapshotPath
    }
    finally {
        Remove-Item -LiteralPath $snapshotPath -Force -ErrorAction SilentlyContinue
    }

    Write-Host "PowerShell package inventory stored successfully." -ForegroundColor Green
}
function Sync-OutfittingScoop {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [string]$ManifestPath
    )

    if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
        throw "Scoop is not installed or not available in PATH."
    }

    if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
        $repoPath = Get-OutfittingRepo
        $ManifestPath = Join-Path $repoPath "packages\x64-windows\scoop.txt"
    }
    if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
        throw "Local Scoop manifest not found: $ManifestPath"
    }

    Write-Host "❖ Reconciling Scoop Packages" -ForegroundColor Cyan
    Write-Host "Manifest: $ManifestPath" -ForegroundColor DarkGray
    try {
        $content = Get-Content -LiteralPath $ManifestPath -Raw -ErrorAction Stop
    } catch {
        throw "Unable to read the local Scoop manifest: $($_.Exception.Message)"
    }

    $buckets = [System.Collections.Generic.List[object]]::new()
    $packages = [System.Collections.Generic.List[string]]::new()
    $bucketNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $packageNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $invalidEntries = [System.Collections.Generic.List[string]]::new()
    $lineNumber = 0

    foreach ($line in [regex]::Split($content, "\r?\n")) {
        $lineNumber++
        $entry = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($entry) -or $entry.StartsWith("#")) { continue }

        $bucketMatch = [regex]::Match($entry, '^(?i:bucket)\s+"(?<value>[^"\r\n]*\S[^"\r\n]*)"\s*$')
        $packageMatch = [regex]::Match($entry, '^(?i:package)\s+"(?<value>[^"\r\n]*\S[^"\r\n]*)"\s*$')

        if ($bucketMatch.Success) {
            $bucketUrl = $bucketMatch.Groups["value"].Value.Trim()
            $normalizedUrl = ($bucketUrl.TrimEnd("/") -replace '(?i)\.git$', '').TrimEnd("/")
            $segments = @($normalizedUrl -split '/' | Where-Object { $_ })
            $bucketName = if ($segments.Count -gt 0) { $segments[-1] -replace '^(?i:scoop-)', '' } else { $null }
            if ([string]::IsNullOrWhiteSpace($bucketName) -or -not $bucketNames.Add($bucketName)) {
                $invalidEntries.Add("line $($lineNumber): invalid or duplicate bucket '$bucketUrl'")
                continue
            }
            $buckets.Add([pscustomobject]@{ Name = $bucketName; Url = $bucketUrl })
        } elseif ($packageMatch.Success) {
            $package = $packageMatch.Groups["value"].Value.Trim()
            $packageName = ($package -split '/')[-1]
            if (-not $packageNames.Add($packageName)) {
                $invalidEntries.Add("line $($lineNumber): duplicate package '$packageName'")
                continue
            }
            $packages.Add($package)
        } else {
            $invalidEntries.Add("line $($lineNumber): $entry")
        }
    }

    if ($invalidEntries.Count -gt 0) {
        throw "Invalid Scoop manifest entries: $($invalidEntries -join '; ')"
    }
    if ($packages.Count -eq 0) {
        throw "The Scoop manifest contains no packages; refusing an empty desired state."
    }

    function Get-ScoopState {
        $json = & scoop export 2>$null | Out-String
        if ($LASTEXITCODE -ne 0) { throw "scoop export exited with code $LASTEXITCODE" }
        try { return $json | ConvertFrom-Json } catch { throw "Unable to parse scoop export output: $($_.Exception.Message)" }
    }

    $state = Get-ScoopState
    $installedBuckets = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($bucket in @($state.buckets)) {
        if ($bucket.Name) { $null = $installedBuckets.Add([string]$bucket.Name) }
    }

    foreach ($bucket in $buckets) {
        if ($installedBuckets.Contains($bucket.Name)) { continue }
        if ($PSCmdlet.ShouldProcess($bucket.Name, "Add Scoop bucket from $($bucket.Url)")) {
            & scoop bucket add $bucket.Name $bucket.Url
            if ($LASTEXITCODE -ne 0) { throw "scoop bucket add '$($bucket.Name)' exited with code $LASTEXITCODE" }
        }
    }

    $installedPackages = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($app in @($state.apps)) {
        if ($app.Name -and [string]$app.Info -notmatch '(?i)\bGlobal install\b') {
            $null = $installedPackages.Add([string]$app.Name)
        }
    }

    foreach ($package in $packages) {
        $packageName = ($package -split '/')[-1]
        if ($installedPackages.Contains($packageName)) { continue }
        if ($PSCmdlet.ShouldProcess($package, "Install Scoop package")) {
            & scoop install $package
            if ($LASTEXITCODE -ne 0) { throw "scoop install '$package' exited with code $LASTEXITCODE" }
        }
    }

    $desiredPackages = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($package in $packages) {
        $null = $desiredPackages.Add(($package -split '/')[-1])
        $dependencies = @(& scoop depends $package 6>$null 2>$null)
        if ($LASTEXITCODE -ne 0) { throw "Unable to resolve dependencies for '$package'" }
        foreach ($dependency in $dependencies) {
            $name = [string]$dependency.Name
            if ([string]::IsNullOrWhiteSpace($name)) { throw "Unrecognized dependency result for '$package'" }
            $null = $desiredPackages.Add($name)
        }
    }

    $state = Get-ScoopState
    $packagesToRemove = @(
        $state.apps |
            Where-Object {
                $_.Name -and
                [string]$_.Info -notmatch '(?i)\bGlobal install\b' -and
                -not $desiredPackages.Contains([string]$_.Name)
            } |
            ForEach-Object { [string]$_.Name } |
            Sort-Object -Unique
    )

    foreach ($package in $packagesToRemove) {
        if ($PSCmdlet.ShouldProcess($package, "Uninstall package absent from scoop.txt")) {
            & scoop uninstall $package
            if ($LASTEXITCODE -ne 0) { throw "scoop uninstall '$package' exited with code $LASTEXITCODE" }
        }
    }

    if ($PSCmdlet.ShouldProcess("Scoop and installed packages", "Update")) {
        & scoop update
        if ($LASTEXITCODE -ne 0) { throw "scoop update exited with code $LASTEXITCODE" }
        & scoop update *
        if ($LASTEXITCODE -ne 0) { throw "scoop package update exited with code $LASTEXITCODE" }
    }
    if ($PSCmdlet.ShouldProcess("Installed Scoop packages", "Remove old versions")) {
        & scoop cleanup *
        if ($LASTEXITCODE -ne 0) { throw "scoop cleanup exited with code $LASTEXITCODE" }
    }

    if ($WhatIfPreference) {
        Write-Host "Scoop reconciliation preview complete." -ForegroundColor Cyan
    } else {
        Write-Host "Scoop packages match scoop.txt." -ForegroundColor Green
        Save-OutfittingScoopInventory
    }
}

function Update-All {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Stop"

    try {
        Write-Host "❖ Updating WinGet Packages" -ForegroundColor Cyan
        winget upgrade --all --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) { throw "winget upgrade exited with code $LASTEXITCODE" }

        Write-Host "❖ Reconciling Scoop Packages from scoop.txt" -ForegroundColor Cyan
        Sync-OutfittingScoop

        if (Get-Command bun -ErrorAction SilentlyContinue) {
            Write-Host "❖ Updating Global Bun Packages" -ForegroundColor Cyan
            bun update --global
            if ($LASTEXITCODE -ne 0) { throw "bun update exited with code $LASTEXITCODE" }
            Save-OutfittingBunGlobalInventory
        }

        Write-Host "❖ Updating PowerShell Modules" -ForegroundColor Cyan
        Get-InstalledModule -ErrorAction SilentlyContinue | Update-Module -AcceptLicense -Force
        Save-OutfittingPowerShellInventory

        Write-Host "❖ Updating PowerShell Profile" -ForegroundColor Cyan
        Invoke-RestMethod -Uri "https://win.jfa.dev/config/pwsh-profile" | Invoke-Expression
        . $PROFILE

        Write-Host "❖ Saving WinGet Lockfile" -ForegroundColor Cyan
        $wingetSnapshot = Join-Path ([System.IO.Path]::GetTempPath()) "outfitting-winget-$PID.json"
        try {
            winget export --output $wingetSnapshot --accept-source-agreements
            if ($LASTEXITCODE -ne 0) { throw "winget export exited with code $LASTEXITCODE" }
            Push-OutfittingLockfile `
                -Machine "jfalava:x64-windows" `
                -Kind "winget" `
                -Path $wingetSnapshot
        }
        finally {
            Remove-Item -LiteralPath $wingetSnapshot -Force -ErrorAction SilentlyContinue
        }

        Write-Host "`nSystem updated successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "`nSystem update failed: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

# -------------------------------
# Expressions
# -------------------------------
if (Get-Command starship -ErrorAction SilentlyContinue) {
    $starshipInit = & starship init powershell
    if ($starshipInit) {
        Invoke-Expression $starshipInit
    }
}

if (Get-Command tirith -ErrorAction SilentlyContinue) {
    $tirithInit = tirith init | Out-String
    if ($tirithInit) {
        Invoke-Expression $tirithInit
    }
}

if (Get-Command zoxide -ErrorAction SilentlyContinue) {
    $zoxideInit = zoxide init powershell | Out-String
    if ($zoxideInit) {
        Invoke-Expression $zoxideInit
    }
}
