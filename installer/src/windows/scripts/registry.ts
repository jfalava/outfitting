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

$baseRegUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main"
$githubApiUrl = "https://api.github.com/repos/jfalava/outfitting/git/trees/main?recursive=1"
$regFilePaths = @()
$validRegFiles = @()

try {
    $apiResponse = Invoke-RestMethod -Uri $githubApiUrl -Method Get -Headers @{ "User-Agent" = "PowerShellScript" }
    $treeItems = $apiResponse.tree
    $regFilePaths = $treeItems | Where-Object { $_.path -like "system/windows/registry/*.reg" -and $_.type -eq "blob" } | ForEach-Object { $_.path }

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
        Write-Host "❖ No .reg files discovered in system/windows/registry/ directory." -ForegroundColor Yellow
    }
} catch {
    $script:hasErrors = $true
    Write-Host "❖ Failed to discover registry files via GitHub API: $_" -ForegroundColor Red
    Write-Host "❖ Skipping registry tweaks." -ForegroundColor Yellow
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
