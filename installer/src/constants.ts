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
  windowsPostInstall: `${GITHUB_RAW_BASE}/windows-post-install-script.ps1`,
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
