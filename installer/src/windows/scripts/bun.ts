export function generateBunScript(): string {
  return `# Bun Global Package Installer
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

Write-Host "❖ Installing Bun global packages..." -ForegroundColor Cyan

# Check if bun is available
if (-Not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host "❖ Error: Bun is not installed" -ForegroundColor Red
    Write-Host "  - Install Bun first using the 'dev' profile" -ForegroundColor Yellow
    Write-Host "  - Command: irm win.jfa.dev/dev | iex" -ForegroundColor Cyan
    Write-Host "\`nPress any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

$bunPackagesUrl = "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/bun.txt"
$bunPackagesFile = "$env:TEMP\bun-packages.txt"

try {
    Invoke-WebRequest -Uri $bunPackagesUrl -OutFile $bunPackagesFile -ErrorAction Stop
    Write-Host "❖ Bun packages list downloaded." -ForegroundColor Green

    # Validate that the file is not empty
    if (-Not (Test-Path $bunPackagesFile) -or (Get-Item $bunPackagesFile).Length -eq 0) {
        Write-Host "❖ Warning: Bun package list is empty" -ForegroundColor Yellow
    } else {
        $bunPackages = Get-Content $bunPackagesFile | Where-Object { -Not ($_ -match '^\\s*$') -and -Not ($_ -match '^#') }

        foreach ($package in $bunPackages) {
            try {
                bun install -g $package
                if ($LASTEXITCODE -ne 0) {
                    throw "bun install exited with code $LASTEXITCODE"
                }
                Write-Host "❖ Installed Bun package: $package" -ForegroundColor Green
            } catch {
                $script:hasErrors = $true
                Write-Host "❖ Failed to install Bun package: $package" -ForegroundColor Red
                Write-Host "  - $_" -ForegroundColor Red
            }
        }
    }

    Remove-Item $bunPackagesFile -ErrorAction SilentlyContinue
} catch {
    $script:hasErrors = $true
    Write-Host "❖ Failed to fetch Bun packages list: $_" -ForegroundColor Red
}

Write-Host "\`n"
if ($script:hasErrors) {
    Write-Host "❖ Installation completed with some errors" -ForegroundColor Yellow
    Write-Host "  - Please review the error messages above" -ForegroundColor Yellow
} else {
    Write-Host "❖ Bun global packages installed successfully" -ForegroundColor Green
}
Write-Host "\`n"
Write-Host "Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
`;
}
