import { Hono } from "hono";
import {
  CONFIG_FILES,
  CONTENT_TYPES,
  PACKAGE_CATEGORIES,
  PROFILES,
  SCRIPT_URLS,
} from "./constants";
import { fetchConfigFile, fetchPackageLists, fetchScript, setScriptHeaders } from "./utils";

const windowsApp = new Hono();

// Route: GET /config/all - Windows profile update script
windowsApp.get("/config/all", async (c) => {
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

// Route: GET /packages/:profile - Serve combined package list for a profile
windowsApp.get("/packages/:profile", async (c) => {
  const profile = c.req.param("profile");
  
  // Check if it's a predefined profile
  if (profile in PROFILES) {
    const categoryKeys = PROFILES[profile as keyof typeof PROFILES];
    const urls = categoryKeys.map((key) => PACKAGE_CATEGORIES[key]);
    
    console.log(`Fetching profile: ${profile}, categories: ${categoryKeys.join(", ")}`);
    
    const packageList = await fetchPackageLists(urls);
    if (!packageList) {
      return c.text(`Failed to fetch packages for profile: ${profile}`, 500);
    }
    
    setScriptHeaders(c, CONTENT_TYPES.plaintext);
    return c.body(packageList);
  }
  
  // Check if it's a custom combination (e.g., "base+dev+gaming")
  const customCategories = profile.split("+");
  const validCategories = customCategories.filter(
    (cat) => cat in PACKAGE_CATEGORIES
  );
  
  if (validCategories.length === 0) {
    return c.json(
      {
        error: "Invalid profile or category combination",
        availableProfiles: Object.keys(PROFILES),
        availableCategories: Object.keys(PACKAGE_CATEGORIES),
      },
      400
    );
  }
  
  const urls = validCategories.map(
    (cat) => PACKAGE_CATEGORIES[cat as keyof typeof PACKAGE_CATEGORIES]
  );
  
  console.log(`Fetching custom combination: ${validCategories.join("+")}`);
  
  const packageList = await fetchPackageLists(urls);
  if (!packageList) {
    return c.text(`Failed to fetch packages for: ${profile}`, 500);
  }
  
  setScriptHeaders(c, CONTENT_TYPES.plaintext);
  return c.body(packageList);
});

// Route: GET /packages - List available profiles and categories
windowsApp.get("/packages", async (c) => {
  return c.json({
    profiles: Object.keys(PROFILES).map((profile) => ({
      name: profile,
      categories: PROFILES[profile as keyof typeof PROFILES],
      url: `/packages/${profile}`,
    })),
    categories: Object.keys(PACKAGE_CATEGORIES).map((category) => ({
      name: category,
      url: `/packages/${category}`,
    })),
    usage: {
      singleProfile: "irm win.jfa.dev/packages/dev | Out-File packages.txt",
      customCombination: "irm win.jfa.dev/packages/base+gaming | Out-File packages.txt",
      installation: "irm win.jfa.dev/dev | iex",
    },
  });
});

// Route: GET /:profile - Install script with specific profile
windowsApp.get("/:profile", async (c) => {
  const profile = c.req.param("profile");
  
  // Check if it's a valid profile or category combination
  const isProfile = profile in PROFILES;
  const isCategory = profile in PACKAGE_CATEGORIES;
  const isCustomCombination = profile.includes("+");
  
  if (!isProfile && !isCategory && !isCustomCombination) {
    // Not a package profile, return 404
    return c.text("Not found", 404);
  }
  
  console.log(`Generating installation script for profile: ${profile}`);
  
  // Fetch the base installation script
  const baseScript = await fetchScript(SCRIPT_URLS.windows);
  if (!baseScript) {
    return c.text("Failed to fetch the base script", 500);
  }
  
  // Replace the package URLs in the script to use the profile endpoint
  const modifiedScript = baseScript
    .replace(
      /\$wingetPackagesUrl = ".*"/,
      `$wingetPackagesUrl = "https://win.jfa.dev/packages/${profile}"`
    )
    .replace(
      /\$msStorePackagesUrl = ".*"/,
      `$msStorePackagesUrl = ""`
    )
    .replace(
      /\$psModulesUrl = ".*"/,
      `$psModulesUrl = ""`
    )
    .replace(
      /Invoke-WebRequest -Uri \$msStorePackagesUrl -OutFile \$msStorePackagesFile[\s\S]*?catch \{[\s\S]*?\}/m,
      `# MS Store and PS Modules are included in the profile package list`
    )
    .replace(
      /Invoke-WebRequest -Uri \$psModulesUrl -OutFile \$psModulesFile[\s\S]*?catch \{[\s\S]*?\}/m,
      ``
    )
    .replace(
      /Install-WingetPackages -filePath \$msStorePackagesFile\n/,
      ``
    )
    .replace(
      /Install-PSModules -filePath \$psModulesFile\n/,
      ``
    );
  
  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(modifiedScript);
});

export default windowsApp;
