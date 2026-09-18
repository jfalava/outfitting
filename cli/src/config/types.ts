/** On-disk + resolved manager configuration. */
export interface ManifestSourceConfig {
  /** GitHub raw (or mirror) base without trailing slash, no ref. */
  baseUrl: string;
  /** Git ref (branch, tag, or SHA). */
  ref: string;
}

/** Repository-relative Windows artifacts consumed by the manager and scripts. */
export interface WindowsRoutesConfig {
  /** Template for WinGet profile files; `{profile}` is replaced at sync time. */
  wingetProfilePath: string;
  scoopPath: string;
  powershellProfilePath: string;
  fontListPath: string;
  registryPath: string;
  /** Profiles used on a new machine when no lockfile selection exists. */
  defaultProfiles: string[];
}

/** Linux package/Nix profile selected for this machine. */
export interface LinuxConfig {
  /** One of generic-linux | oci-agents | ubuntu-wsl. */
  profile: string;
}

export interface ManagerConfigFile {
  /** Optional override; when omitted, auto `user:arch-os` is used. */
  machineId?: string;
  manifest?: Partial<ManifestSourceConfig>;
  windows?: Partial<WindowsRoutesConfig>;
  linux?: Partial<LinuxConfig>;
}

export interface ManagerConfig {
  /** Absolute state root directory. */
  stateRoot: string;
  /** Effective machine id used for lock/inventory pushes. */
  machineId: string;
  /** Whether machineId came from config/env (true) or auto-detect (false). */
  machineIdOverridden: boolean;
  manifest: ManifestSourceConfig;
  /** Resolved for configs loaded from disk; optional for backwards-compatible injected configs. */
  windows?: WindowsRoutesConfig;
  /** Persisted Linux profile; absent on non-Linux or unconfigured hosts. */
  linux?: LinuxConfig;
}

export const DEFAULT_LINUX_PROFILE = "generic-linux";

export const DEFAULT_MANIFEST_BASE_URL = "https://raw.githubusercontent.com/jfalava/outfitting";

export const DEFAULT_MANIFEST_REF = "main";

export const DEFAULT_WINDOWS_ROUTES: WindowsRoutesConfig = {
  wingetProfilePath: "packages/windows/{profile}.txt",
  scoopPath: "packages/windows/scoop.txt",
  powershellProfilePath: "dotfiles/Microsoft.PowerShell_profile.ps1",
  fontListPath: "fonts/fontget.txt",
  registryPath: "system/windows/registry",
  defaultProfiles: ["base"],
};
