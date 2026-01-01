import { Hono } from "hono";
import {
  CONFIG_FILES,
  CONTENT_TYPES,
  SCRIPT_URLS,
  WINDOWS_PACKAGES_BASE,
  WINDOWS_PACKAGE_PROFILES,
} from "./constants";
import { fetchConfigFile, fetchScript, setScriptHeaders } from "./utils";

const windowsApp = new Hono();

// Route: GET /config/pwsh-profile - Windows PowerShell profile update script
windowsApp.get("/config/pwsh-profile", async (c) => {
  const host = c.req.header("Host") || "";

  const script = `# Update PowerShell profile from outfitting repository

Write-Host "Updating PowerShell profile..." -ForegroundColor Cyan

# Backup function
function Backup-IfExists {
    param($Path)
    if (Test-Path $Path) {
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        Copy-Item $Path "$Path.backup.$timestamp"
        Write-Host "Backed up $Path" -ForegroundColor Yellow
    }
}

$profilePath = $PROFILE.CurrentUserAllHosts
Backup-IfExists $profilePath

# Download latest config
Invoke-WebRequest -Uri "https://${host}/config/powershell" -OutFile $profilePath
Write-Host "✓ Updated PowerShell profile" -ForegroundColor Green

Write-Host ""
Write-Host "Profile updated! Reload your profile with: . \`$PROFILE" -ForegroundColor Cyan
`;

  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(script);
});

// Route: GET /config/:file - Fetch individual config files (Windows only)
windowsApp.get("/config/:file", async (c) => {
  const fileKey = c.req.param("file");

  // Validate file key exists
  if (!CONFIG_FILES[fileKey]) {
    return c.json(
      {
        error: "Invalid config file",
        available: Object.keys(CONFIG_FILES),
      },
      400,
    );
  }

  console.log(`Fetching config file: ${fileKey}`);

  const result = await fetchConfigFile(CONFIG_FILES[fileKey]);
  if (!result) {
    return c.text(`Failed to fetch config file: ${fileKey}`, 500);
  }

  setScriptHeaders(c, result.contentType);
  return c.body(result.content);
});

// Route: GET /packages/:profile - Fetch Windows package lists (supports composition like "base+dev+gaming")
windowsApp.get("/packages/:profile", async (c) => {
  const profileParam = c.req.param("profile");

  // Split by '+' to support compound profiles (e.g., "base+dev+gaming")
  const requestedProfiles = profileParam.split("+").map((p) => p.trim().toLowerCase());

  // Validate all requested profiles
  const invalidProfiles = requestedProfiles.filter(
    (p) => !WINDOWS_PACKAGE_PROFILES.includes(p as any),
  );

  if (invalidProfiles.length > 0) {
    return c.json(
      {
        error: "Invalid profile(s)",
        invalid: invalidProfiles,
        available: WINDOWS_PACKAGE_PROFILES,
      },
      400,
    );
  }

  console.log(`Fetching Windows packages for profiles: ${requestedProfiles.join(", ")}`);

  // Fetch all requested package files
  const packageContents: string[] = [];

  for (const profile of requestedProfiles) {
    const url = `${WINDOWS_PACKAGES_BASE}/${profile}.txt`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch ${profile}.txt: ${response.status}`);
        return c.text(`Failed to fetch package list for profile: ${profile}`, 500);
      }

      const content = await response.text();
      packageContents.push(`# Packages from ${profile} profile\n${content}`);
    } catch (error) {
      console.error(`Error fetching ${profile}.txt:`, error);
      return c.text(`Error fetching package list for profile: ${profile}`, 500);
    }
  }

  // Combine all package contents
  const combinedPackages = packageContents.join("\n\n");

  setScriptHeaders(c, CONTENT_TYPES.plaintext);
  return c.body(combinedPackages);
});

// Route: GET /bun - Install Bun global packages
windowsApp.get("/bun", async (c) => {
  const bunScript = `# Bun Global Package Installer
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
        $bunPackages = Get-Content $bunPackagesFile | Where-Object { -Not ($_ -match '^\`s*$') -and -Not ($_ -match '^#') }

        foreach ($package in $bunPackages) {
            try {
                bun install -g $package
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

  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(bunScript);
});

// Route: GET / - Display available packages (help message)
windowsApp.get("/", async (c) => {
  const host = c.req.header("Host") || "win.jfa.dev";

  const helpScript = `# Outfitting - Windows Package Installer
#
# Usage: irm ${host}/<profile> | iex
#
# Available profiles:
#   base     - Core packages, runtimes, and utilities
#   dev      - Development tools and environments
#   gaming   - Gaming platforms and tools
#   work     - Work-related applications
#   qol      - Quality of life improvements
#   network  - Network tools and utilities
#
# Additional installations:
#   bun      - Install Bun global packages (requires Bun to be installed)
#
# Examples:
#   irm ${host}/base | iex              # Install base packages
#   irm ${host}/dev | iex               # Install dev packages
#   irm ${host}/dev+gaming | iex        # Install dev + gaming packages
#   irm ${host}/base+dev+qol | iex      # Install base + dev + qol packages
#   irm ${host}/bun | iex               # Install Bun global packages
#
# Note: Packages must be explicitly specified. There is no default installation.

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Outfitting - Windows Installer" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Available package profiles:" -ForegroundColor Yellow
Write-Host "  • base     - Core packages, runtimes, and utilities" -ForegroundColor White
Write-Host "  • dev      - Development tools and environments" -ForegroundColor White
Write-Host "  • gaming   - Gaming platforms and tools" -ForegroundColor White
Write-Host "  • work     - Work-related applications" -ForegroundColor White
Write-Host "  • qol      - Quality of life improvements" -ForegroundColor White
Write-Host "  • network  - Network tools and utilities" -ForegroundColor White
Write-Host ""
Write-Host "Additional installations:" -ForegroundColor Yellow
Write-Host "  • bun      - Install Bun global packages (requires Bun installed)" -ForegroundColor White
Write-Host ""
Write-Host "Usage examples:" -ForegroundColor Yellow
Write-Host "  irm ${host}/base | iex" -ForegroundColor Green
Write-Host "  irm ${host}/dev | iex" -ForegroundColor Green
Write-Host "  irm ${host}/dev+gaming | iex" -ForegroundColor Green
Write-Host "  irm ${host}/base+dev+qol | iex" -ForegroundColor Green
Write-Host "  irm ${host}/bun | iex" -ForegroundColor Green
Write-Host ""
Write-Host "Tip: Combine multiple profiles with '+' to customize your installation" -ForegroundColor Cyan
Write-Host ""
`;

  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(helpScript);
});

// Route: GET /:profile - Install script with specific profile (supports composition like "base+dev+gaming")
windowsApp.get("/:profile", async (c) => {
  const profileParam = c.req.param("profile");
  const host = c.req.header("Host") || "win.jfa.dev";

  // Split by '+' to support compound profiles (e.g., "base+dev+gaming")
  const requestedProfiles = profileParam.split("+").map((p) => p.trim().toLowerCase());

  // Validate all requested profiles
  const invalidProfiles = requestedProfiles.filter(
    (p) => !WINDOWS_PACKAGE_PROFILES.includes(p as any),
  );

  if (invalidProfiles.length > 0) {
    const errorScript = `# Error: Invalid profile(s) specified
#
# Invalid profiles: ${invalidProfiles.join(", ")}
# Available profiles: ${WINDOWS_PACKAGE_PROFILES.join(", ")}
#
# Usage examples:
#   irm ${host}/base | iex
#   irm ${host}/dev+gaming | iex

Write-Host ""
Write-Host "Error: Invalid profile(s) specified" -ForegroundColor Red
Write-Host "  Invalid: ${invalidProfiles.join(", ")}" -ForegroundColor Yellow
Write-Host ""
Write-Host "Available profiles:" -ForegroundColor Cyan
Write-Host "  ${WINDOWS_PACKAGE_PROFILES.join(", ")}" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
exit 1
`;
    setScriptHeaders(c, CONTENT_TYPES.powershell);
    return c.body(errorScript);
  }

  console.log(`Serving installation script for profiles: ${requestedProfiles.join(", ")}`);

  // Fetch the base installation script
  const baseScript = await fetchScript(SCRIPT_URLS.windows);
  if (!baseScript) {
    return c.text("Failed to fetch the base script", 500);
  }

  // Replace the hardcoded package URL with the requested profile(s)
  const modifiedScript = baseScript.replace(
    '$wingetPackagesUrl = "https://win.jfa.dev/packages/base"',
    `$wingetPackagesUrl = "https://${host}/packages/${profileParam}"`,
  );

  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(modifiedScript);
});

export default windowsApp;
