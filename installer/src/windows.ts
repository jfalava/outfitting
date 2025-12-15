import { Hono } from "hono";
import { CONFIG_FILES, CONTENT_TYPES, SCRIPT_URLS } from "./constants";
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

// Route: GET / - Windows main installation script
windowsApp.get("/", async (c) => {
  console.log("Windows Script URL:", SCRIPT_URLS.windows);

  const scriptContent = await fetchScript(SCRIPT_URLS.windows);
  if (!scriptContent) {
    return c.text("Failed to fetch the script", 500);
  }

  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(scriptContent);
});

// Route: GET /:profile - Install script with specific profile (simplified - no package lists)
windowsApp.get("/:profile", async (c) => {
  const profile = c.req.param("profile");

  console.log(`Serving installation script for profile: ${profile}`);

  // Fetch the base installation script (same as main route)
  const baseScript = await fetchScript(SCRIPT_URLS.windows);
  if (!baseScript) {
    return c.text("Failed to fetch the base script", 500);
  }

  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(baseScript);
});

export default windowsApp;
