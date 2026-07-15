export function generateMsstoreScript(host: string, profileParam: string): string {
  return `# Microsoft Store Package Installer
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

Write-Host "❖ Checking Winget terms of use..." -ForegroundColor Cyan
winget --info

Write-Host "❖ Installing Microsoft Store packages..." -ForegroundColor Cyan

$msstorePackagesUrl = "https://${host}/packages/msstore/${profileParam}"
$msstorePackagesFile = "$env:TEMP\\msstore.txt"

# Download the package list
try {
    Invoke-WebRequest -Uri $msstorePackagesUrl -OutFile $msstorePackagesFile
    Write-Host "❖ Microsoft Store package list downloaded." -ForegroundColor Green
} catch {
    $script:hasErrors = $true
    Write-Host "❖ Failed to download package list:" -ForegroundColor Red
    Write-Host "  - $_" -ForegroundColor Red
    Write-Host "\`nPress any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Install Microsoft Store packages
function Install-MicrosoftStorePackages {
    param (
        [string]$filePath
    )

    if (-Not (Test-Path $filePath)) {
        $script:hasErrors = $true
        Write-Host "❖ Installation failed: the package list was not found:" -ForegroundColor Red
        Write-Host "  - $filePath" -ForegroundColor Red
        Write-Host "❖ And the script cannot continue." -ForegroundColor Red
        Write-Host "\`nPress any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 1
    }

    $packages = Get-Content $filePath | Where-Object { -Not ($_ -match '^\\s*$') -and -Not ($_ -match '^#') }

    foreach ($package in $packages) {
        try {
            winget install --id $package --source msstore --accept-source-agreements --accept-package-agreements -e
            if ($LASTEXITCODE -ne 0) {
                throw "winget install exited with code $LASTEXITCODE"
            }
            Write-Host "❖ Installed Microsoft Store package: $package" -ForegroundColor Green
        } catch {
            $script:hasErrors = $true
            Write-Host "❖ Failed to install Microsoft Store package:" -ForegroundColor Red
            Write-Host "  - \${package}: $_" -ForegroundColor Red
            # Continue to next package
        }
    }
}

Install-MicrosoftStorePackages -filePath $msstorePackagesFile

# Cleanup
Remove-Item $msstorePackagesFile -ErrorAction SilentlyContinue

Write-Host "\`n"
if ($script:hasErrors) {
    Write-Host "❖ Installation completed with some errors" -ForegroundColor Yellow
    Write-Host "  - Please review the error messages above" -ForegroundColor Yellow
} else {
    Write-Host "❖ Microsoft Store packages installed successfully" -ForegroundColor Green
}
Write-Host "\`n"
Write-Host "Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
`;
}

export function generateMsstoreErrorScript(
  host: string,
  invalidProfiles: string[],
  availableProfiles: readonly string[],
): string {
  return `# Error: Invalid Microsoft Store profile(s) specified
#
# Invalid profiles: ${invalidProfiles.join(", ")}
# Available profiles: ${availableProfiles.join(", ")}
#
# Usage examples:
#   irm ${host}/msstore/msstore-base | iex
#   irm ${host}/msstore/msstore-base+msstore-gaming | iex

Write-Host ""
Write-Host "Error: Invalid Microsoft Store profile(s) specified" -ForegroundColor Red
Write-Host "  Invalid: ${invalidProfiles.join(", ")}" -ForegroundColor Yellow
Write-Host ""
Write-Host "Available profiles:" -ForegroundColor Cyan
Write-Host "  ${availableProfiles.join(", ")}" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
exit 1
`;
}
