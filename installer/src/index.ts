import { Hono } from "hono";

const app = new Hono();

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main";

// Config file mappings
const CONFIG_FILES: Record<string, { path: string; contentType: string }> = {
  zshrc: {
    path: `${GITHUB_RAW_BASE}/dotfiles/.zshrc-wsl`,
    contentType: "text/plain",
  },
  ripgreprc: {
    path: `${GITHUB_RAW_BASE}/dotfiles/.ripgreprc`,
    contentType: "text/plain",
  },
  gitconfig: {
    path: `${GITHUB_RAW_BASE}/dotfiles/.gitconfig`,
    contentType: "text/plain",
  },
  powershell: {
    path: `${GITHUB_RAW_BASE}/dotfiles/.powershell-profile.ps1`,
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

// Route: GET /config/all - Generate script to update all configs
app.get("/config/all", async (c) => {
  const host = c.req.header("Host") || "";

  const allowedHosts = ["wsl.jfa.dev", "win.jfa.dev"];
  const isAllowedHost = allowedHosts.some((allowedHost) =>
    host.includes(allowedHost),
  );

  if (!isAllowedHost) {
    return c.text("I'm a teapot", 418);
  }

  const isWSL = host.includes("wsl.jfa.dev");

  let script: string;

  if (isWSL) {
    // WSL/Linux update script
    script = `#!/bin/bash
# Update all dotfiles from outfitting repository

echo "Updating dotfiles..."

# Backup existing configs
backup_if_exists() {
  if [ -f "$1" ]; then
    cp "$1" "$1.backup.$(date +%Y%m%d_%H%M%S)"
    echo "Backed up $1"
  fi
}

backup_if_exists ~/.zshrc
backup_if_exists ~/.ripgreprc
backup_if_exists ~/.gitconfig

# Download latest configs
curl -fsSL "${host}/config/zshrc" -o ~/.zshrc && echo "✓ Updated ~/.zshrc"
curl -fsSL "${host}/config/ripgreprc" -o ~/.ripgreprc && echo "✓ Updated ~/.ripgreprc"
curl -fsSL "${host}/config/gitconfig" -o ~/.gitconfig && echo "✓ Updated ~/.gitconfig"

echo ""
echo "All configs updated! Reload your shell or run: source ~/.zshrc"
`;
  } else {
    // Windows update script
    script = `# Update all dotfiles from outfitting repository

Write-Host "Updating dotfiles..." -ForegroundColor Cyan

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
Write-Host "Config updated! Reload your profile with: . \`$PROFILE" -ForegroundColor Cyan
`;
  }

  c.header(
    "Content-Type",
    isWSL ? "text/x-shellscript" : "application/x-powershell",
  );
  c.header("Cache-Control", "no-cache");
  c.header("Access-Control-Allow-Origin", "*");

   return c.body(script);
});

// Route: GET /config/:file - Fetch individual config files
app.get("/config/:file", async (c) => {
  const host = c.req.header("Host") || "";
  const fileKey = c.req.param("file");

  const allowedHosts = ["wsl.jfa.dev", "win.jfa.dev"];
  const isAllowedHost = allowedHosts.some((allowedHost) =>
    host.includes(allowedHost),
  );

  if (!isAllowedHost) {
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

  const allowedHosts = ["wsl.jfa.dev", "win.jfa.dev"];
  const isAllowedHost = allowedHosts.some((allowedHost) =>
    host.includes(allowedHost),
  );

  if (!isAllowedHost) {
    return c.text("I'm a teapot", 418);
  }

  const wslScriptUrl = `${GITHUB_RAW_BASE}/wsl-install-script.sh`;
  const windowsScriptUrl = `${GITHUB_RAW_BASE}/windows-install-script.ps1`;

  const scriptUrl = host.includes("wsl.jfa.dev")
    ? wslScriptUrl
    : windowsScriptUrl;

  console.log("Script URL:", scriptUrl);

  const response = await fetch(scriptUrl, {
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
  const contentType = host.includes("wsl.jfa.dev")
    ? "text/x-shellscript"
    : "application/x-powershell";

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
