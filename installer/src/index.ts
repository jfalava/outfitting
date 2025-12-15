import { Hono } from "hono";

const app = new Hono();

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main";

// Config file mappings (Windows only - WSL configs are managed by Home Manager)
const CONFIG_FILES: Record<string, { path: string; contentType: string }> = {
  powershell: {
    path: `${GITHUB_RAW_BASE}/dotfiles/Microsoft.PowerShell_profile.ps1`,
    contentType: "text/plain",
  },
};

// Helper function to fetch a config file
async function fetchConfigFile(fileKey: string) {
  const config = CONFIG_FILES[fileKey];
  if (!config) {
    return null;
  }

  const response = await fetch(config.path, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "CloudflareWorker",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    return null;
  }

  return {
    content: await response.text(),
    contentType: config.contentType,
  };
}

// Route: GET /config/all - Windows profile update script
app.get("/config/all", async (c) => {
  const host = c.req.header("Host") || "";

  if (!host.includes("win.jfa.dev")) {
    return c.text("I'm a teapot", 418);
  }

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

  c.header("Content-Type", "application/x-powershell");
  c.header("Cache-Control", "no-cache");
  c.header("Access-Control-Allow-Origin", "*");

  return c.body(script);
});

// Route: GET /config/:file - Fetch individual config files (Windows only)
app.get("/config/:file", async (c) => {
  const host = c.req.header("Host") || "";
  const fileKey = c.req.param("file");

  if (!host.includes("win.jfa.dev")) {
    return c.text("I'm a teapot", 418);
  }

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

  const result = await fetchConfigFile(fileKey);
  if (!result) {
    return c.text(`Failed to fetch config file: ${fileKey}`, 500);
  }

  c.header("Content-Type", result.contentType);
  c.header("Cache-Control", "no-cache");
  c.header("Access-Control-Allow-Origin", "*");

  return c.body(result.content);
});

// Route: GET / - Main installation scripts
app.get("/", async (c) => {
  const host = c.req.header("Host") || "";

  const allowedHosts = ["wsl.jfa.dev", "win.jfa.dev", "mac.jfa.dev"];
  const isAllowedHost = allowedHosts.some((allowedHost) =>
    host.includes(allowedHost),
  );

  if (!isAllowedHost) {
    return c.text("I'm a teapot", 418);
  }

  const wslScriptUrl = `${GITHUB_RAW_BASE}/wsl-install-script.sh`;
  const windowsScriptUrl = `${GITHUB_RAW_BASE}/windows-install-script.ps1`;
  const macosScriptUrl = `${GITHUB_RAW_BASE}/macos-install-script.sh`;

  let scriptUrl: string;
  let contentType: string;

  if (host.includes("wsl.jfa.dev")) {
    scriptUrl = wslScriptUrl;
    contentType = "text/x-shellscript";
  } else if (host.includes("mac.jfa.dev")) {
    scriptUrl = macosScriptUrl;
    contentType = "text/x-shellscript";
  } else {
    scriptUrl = windowsScriptUrl;
    contentType = "application/x-powershell";
  }

  console.log("Script URL:", scriptUrl);

  const response = await fetch(scriptUrl, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "JFA Outfitting Installer",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    return c.text(`Failed to fetch the script (${response.status})`, 500);
  }

  const scriptContent = await response.text();

  console.log("Content-Type:", contentType);

  c.header("Content-Type", contentType);
  c.header("Cache-Control", "no-cache");
  c.header("Access-Control-Allow-Origin", "*");

  return c.body(scriptContent);
});

// Route: GET /post-install - Windows post-install script
app.get("/post-install", async (c) => {
  const host = c.req.header("Host") || "";

  if (!host.includes("win.jfa.dev")) {
    return c.text("I'm a teapot", 418);
  }

  const windowsPostInstallScriptUrl = `${GITHUB_RAW_BASE}/windows-post-install-script.ps1`;

  console.log("Post-install Script URL:", windowsPostInstallScriptUrl);

  const response = await fetch(windowsPostInstallScriptUrl, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "CloudflareWorker",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    return c.text(`Failed to fetch the script (${response.status})`, 500);
  }

  const scriptContent = await response.text();

  c.header("Content-Type", "application/x-powershell");
  c.header("Cache-Control", "no-cache");
  c.header("Access-Control-Allow-Origin", "*");

  return c.body(scriptContent);
});

// Catch-all: Return 418 for unknown routes
app.get("*", (c) => {
  return c.text("I'm a teapot", 418);
});

export default app;
