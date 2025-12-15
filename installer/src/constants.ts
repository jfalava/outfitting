/**
 * Shared constants for the outfitting installer worker
 */

export const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main";

export const ALLOWED_HOSTS = ["wsl.jfa.dev", "win.jfa.dev", "mac.jfa.dev"];

export const USER_AGENT = "JFA Outfitting Installer";

/**
 * Script URLs for each platform
 */
export const SCRIPT_URLS = {
  windows: `${GITHUB_RAW_BASE}/windows-install-script.ps1`,
  wsl: `${GITHUB_RAW_BASE}/wsl-install-script.sh`,
  macos: `${GITHUB_RAW_BASE}/macos-install-script.sh`,
} as const;

/**
 * Content types for different script types
 */
export const CONTENT_TYPES = {
  powershell: "application/x-powershell",
  shellscript: "text/x-shellscript",
  plaintext: "text/plain",
} as const;

/**
 * Config file mappings (Windows only - WSL configs are managed by Home Manager)
 */
export const CONFIG_FILES: Record<
  string,
  { path: string; contentType: string }
> = {
  powershell: {
    path: `${GITHUB_RAW_BASE}/dotfiles/Microsoft.PowerShell_profile.ps1`,
    contentType: CONTENT_TYPES.plaintext,
  },
};

/**
 * Windows package categories
 */
export const PACKAGE_CATEGORIES = {
  base: `${GITHUB_RAW_BASE}/packages/x64-windows/base.txt`,
  dev: `${GITHUB_RAW_BASE}/packages/x64-windows/dev.txt`,
  gaming: `${GITHUB_RAW_BASE}/packages/x64-windows/gaming.txt`,
  creative: `${GITHUB_RAW_BASE}/packages/x64-windows/creative.txt`,
  work: `${GITHUB_RAW_BASE}/packages/x64-windows/work.txt`,
  "msstore-base": `${GITHUB_RAW_BASE}/packages/x64-windows/msstore-base.txt`,
  "msstore-gaming": `${GITHUB_RAW_BASE}/packages/x64-windows/msstore-gaming.txt`,
  "msstore-qol": `${GITHUB_RAW_BASE}/packages/x64-windows/msstore-qol.txt`,
  "msstore-work": `${GITHUB_RAW_BASE}/packages/x64-windows/msstore-work.txt`,
  "pwsh-modules": `${GITHUB_RAW_BASE}/packages/x64-windows/pwsh-modules.txt`,
} as const;

/**
 * Profile definitions - combinations of package categories
 * Key: profile name
 * Value: array of category keys to include
 */
export const PROFILES = {
  base: ["base", "msstore-base", "msstore-qol", "pwsh-modules"],
  dev: ["base", "dev", "msstore-base", "msstore-qol", "pwsh-modules"],
  gaming: ["base", "gaming", "creative", "msstore-base", "msstore-gaming", "msstore-qol", "pwsh-modules"],
  work: ["base", "dev", "creative", "work", "msstore-base", "msstore-qol", "msstore-work", "pwsh-modules"],
  full: ["base", "dev", "gaming", "creative", "work", "msstore-base", "msstore-gaming", "msstore-qol", "msstore-work", "pwsh-modules"],
} as const;
