export function generateRegistryScript(): string {
  return `# Windows Registry Tweaks Installer
# Set error action preference to stop so all errors become terminating
$ErrorActionPreference = "Stop"
$script:hasErrors = $false

# Trap to catch all errors
trap {
    Write-Host "\`n❖ An unexpected error occurred:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
    $script:hasErrors = $true
    Continue
}

Write-Host "❖ Installing Windows registry tweaks..." -ForegroundColor Cyan

$manifestBaseUrl = $env:OUTFITTING_MANIFEST_BASE_URL
$manifestRef = $env:OUTFITTING_MANIFEST_REF
$outfittingStateRoot = if ([string]::IsNullOrWhiteSpace($env:OUTFITTING_STATE_ROOT)) {
    Join-Path $(if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { "$env:USERPROFILE/AppData/Local" }) "outfitting"
} else {
    $env:OUTFITTING_STATE_ROOT
}
$configPath = Join-Path $outfittingStateRoot "config.json"
if (([string]::IsNullOrWhiteSpace($manifestBaseUrl) -or [string]::IsNullOrWhiteSpace($manifestRef)) -and (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    try {
        $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace($manifestBaseUrl)) {
            $manifestBaseUrl = [string]$config.manifest.baseUrl
        }
        if ([string]::IsNullOrWhiteSpace($manifestRef)) {
            $manifestRef = [string]$config.manifest.ref
        }
    } catch {
        # Keep defaults; the manager reports invalid config files during init.
    }
}
if ([string]::IsNullOrWhiteSpace($manifestBaseUrl)) {
    $manifestBaseUrl = "https://raw.githubusercontent.com/jfalava/outfitting"
}
if ([string]::IsNullOrWhiteSpace($manifestRef)) {
    $manifestRef = "main"
}
$baseRegUrl = "$manifestBaseUrl/$manifestRef"
$githubApiUrl = $null
try {
    $sourceUri = [Uri]$manifestBaseUrl
    $sourceSegments = @($sourceUri.AbsolutePath.Trim("/").Split("/") | Where-Object { $_.Length -gt 0 })
    if ($sourceUri.Host -eq "raw.githubusercontent.com" -and $sourceSegments.Count -eq 2) {
        $encodedRef = [Uri]::EscapeDataString($manifestRef)
        $githubApiUrl = "https://api.github.com/repos/$($sourceSegments[0])/$($sourceSegments[1])/git/trees/$encodedRef?recursive=1"
    }
} catch {
    $githubApiUrl = $null
}
$registryRoute = "system/windows/registry"
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    try {
        $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
        $property = $config.windows.PSObject.Properties["registryPath"]
        if ($null -ne $property -and -not [string]::IsNullOrWhiteSpace([string]$property.Value)) {
            $registryRoute = ([string]$property.Value).Trim().Trim("/")
        }
    } catch {
        # Keep the default registry route.
    }
}
$regFilePaths = @()
$validRegFiles = @()

try {
    if ($null -eq $githubApiUrl) {
        throw "Registry discovery requires a GitHub raw manifest source."
    }
    $apiResponse = Invoke-RestMethod -Uri $githubApiUrl -Method Get -Headers @{ "User-Agent" = "PowerShellScript" }
    $treeItems = $apiResponse.tree
    $regFilePaths = $treeItems | Where-Object { $_.path -like "$registryRoute/*.reg" -and $_.type -eq "blob" } | ForEach-Object { $_.path }

    if ($regFilePaths.Count -gt 0) {
        Write-Host "\`n❖ Discovered $($regFilePaths.Count) registry tweak(s) from GitHub repo:" -ForegroundColor Cyan
        foreach ($path in $regFilePaths) {
            $fileName = Split-Path $path -Leaf
            Write-Host "  - $fileName" -ForegroundColor Yellow
        }

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
                Write-Host "❖ Failed to fetch registry file \${path}: $_" -ForegroundColor Red
            }
        }

        if ($validRegFiles.Count -gt 0) {
            Write-Host "\`n❖ Found $($validRegFiles.Count) valid registry tweak(s) to install:" -ForegroundColor Cyan
            foreach ($file in $validRegFiles) {
                Write-Host "  - $($file.Name)" -ForegroundColor Yellow
            }

            $globalChoice = Read-Host "\`nChoose: (A)ll, (N)one, or (R)eview each? [A/N/R] (default: A)"
            $globalChoice = if ([string]::IsNullOrWhiteSpace($globalChoice)) { "A" } else { $globalChoice.ToUpper() }
            if ($globalChoice -notin @("A", "N", "R")) {
                $globalChoice = "N"
            }

            switch ($globalChoice) {
                "A" {
                    foreach ($file in $validRegFiles) {
                        $tempRegPath = "$env:TEMP\\$($file.Name)"
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
                        Write-Host "\`n❖ --- $($file.Name) ---" -ForegroundColor Cyan
                        $file.Content | ForEach-Object { Write-Host $_ -ForegroundColor Gray }
                        $perChoice = Read-Host "Install this tweak? [Y/N] (default: N)"
                        $perChoice = if ([string]::IsNullOrWhiteSpace($perChoice)) { "N" } else { $perChoice.ToUpper() }
                        if ($perChoice -eq "Y") {
                            $tempRegPath = "$env:TEMP\\$($file.Name)"
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
                default { Write-Host "❖ Invalid choice, skipping all registry tweaks." -ForegroundColor Yellow }
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

Write-Host "\`n"
if ($script:hasErrors) {
    Write-Host "❖ Registry tweak installation completed with some errors" -ForegroundColor Yellow
    Write-Host "  - Please review the error messages above" -ForegroundColor Yellow
} else {
    Write-Host "❖ Registry tweak installation complete" -ForegroundColor Green
}
Write-Host "\`n"
Write-Host "Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
if ($script:hasErrors) {
    exit 1
}
`;
}
