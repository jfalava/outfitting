/**
 * Compile-time-oriented package-manager availability.
 * Every binary ships this table so foreign PMs can explain which OS build owns them
 * without shipping that PM's implementation.
 */
export type HostPlatform = "macos" | "windows" | "linux";

export type PackageManager =
  | "bun"
  | "brew"
  | "nix"
  | "scoop"
  | "winget"
  | "all";

/** Which host platform ships each package-manager command. */
export const PACKAGE_MANAGER_PLATFORM = {
  bun: "all",
  brew: "macos",
  nix: "macos",
  scoop: "windows",
  winget: "windows",
  all: "all",
} as const satisfies Record<PackageManager, HostPlatform | "all">;

export const NIX_ACTIONS = ["build", "switch", "test", "dry"] as const;
export type NixAction = (typeof NIX_ACTIONS)[number];

export const MACOS_UPDATE_MANAGERS = ["bun", "brew", "nix", "all"] as const;
export type MacosUpdateManager = (typeof MACOS_UPDATE_MANAGERS)[number];

/** PMs that are never native on the given host (hint stubs only). */
export function foreignPackageManagers(host: HostPlatform): PackageManager[] {
  return (Object.keys(PACKAGE_MANAGER_PLATFORM) as PackageManager[]).filter((pm) => {
    const owner = PACKAGE_MANAGER_PLATFORM[pm];
    return owner !== "all" && owner !== host;
  });
}

export function platformLabel(platform: HostPlatform | "all"): string {
  switch (platform) {
    case "macos":
      return "macOS";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    case "all":
      return "all platforms";
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}

export function foreignPackageManagerMessage(pm: PackageManager, host: HostPlatform): string {
  const owner = PACKAGE_MANAGER_PLATFORM[pm];
  if (owner === "all" || owner === host) {
    return `\`${pm}\` is available in this ${platformLabel(host)} build.`;
  }
  return `\`${pm}\` is only available in the ${platformLabel(owner)} build of outfitting-manager (this binary is ${platformLabel(host)}).`;
}
