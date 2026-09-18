import type { ManagerConfig, WindowsRoutesConfig } from "@/config/types";
import { fetchManifest, type ManifestFetcher } from "@/fetch";

/** Shared Nix modules, packages, and Unix dotfiles used by every profile. */
export const COMMON_SOURCE_PATHS = [
  "system/common/dotfiles.nix",
  "system/common/zsh.nix",
  "system/common/zsh/outfitting.plugin.zsh",
  "packages/common/programs.nix",
  "packages/common/packages.nix",
  "dotfiles/ssh.config",
] as const;

/**
 * Complete macOS source closure required to evaluate the Nix flake and load
 * the manager-owned Brewfile and Zsh plugins.
 */
export const MACOS_SOURCE_PATHS = [
  "system/macos/flake.nix",
  "system/macos/darwin.nix",
  "system/macos/home.nix",
  "system/macos/zsh/macos.plugin.zsh",
  ...COMMON_SOURCE_PATHS,
  "packages/macos/programs.nix",
  "packages/macos/packages.nix",
  "packages/macos/zed.nix",
  "packages/macos/Brewfile",
  "fonts/fontget.txt",
] as const;

/** Shared Unix/Nix modules required by every Linux Home Manager profile. */
export const LINUX_COMMON_SOURCE_PATHS = [...COMMON_SOURCE_PATHS] as const;

/** Native package list for the portable generic-linux profile. */
export const GENERIC_LINUX_SOURCE_PATHS = ["packages/linux/generic-linux.txt"] as const;

/** Sparse source for the headless oci-agents Home Manager profile. */
export const OCI_AGENTS_SOURCE_PATHS = [
  ...LINUX_COMMON_SOURCE_PATHS,
  "packages/linux/oci-agents.txt",
  "packages/oci-agents/packages.nix",
  "system/oci-agents/agent-guidance.md",
  "system/oci-agents/agents.nix",
  "system/oci-agents/bootstrap.sh",
  "system/oci-agents/flake.lock",
  "system/oci-agents/flake.nix",
  "system/oci-agents/home.nix",
  "system/oci-agents/zsh/oci-agents.plugin.zsh",
] as const;

/** Sparse source for the Ubuntu WSL Home Manager profile. */
export const UBUNTU_WSL_SOURCE_PATHS = [
  ...LINUX_COMMON_SOURCE_PATHS,
  "packages/ubuntu-wsl/apt.txt",
  "packages/ubuntu-wsl/packages.nix",
  "system/ubuntu-wsl/base.nix",
  "system/ubuntu-wsl/bootstrap.sh",
  "system/ubuntu-wsl/flake.lock",
  "system/ubuntu-wsl/flake.nix",
  "system/ubuntu-wsl/zsh/wsl.plugin.zsh",
] as const;

/** Union of every Linux profile path (allowlist + tests). */
export const LINUX_SOURCE_PATHS = [
  ...GENERIC_LINUX_SOURCE_PATHS,
  ...OCI_AGENTS_SOURCE_PATHS,
  ...UBUNTU_WSL_SOURCE_PATHS,
] as const;

/** Resolve the sparse source closure for a Linux profile. */
export function linuxSourcePaths(
  profile: "generic-linux" | "oci-agents" | "ubuntu-wsl",
): ReadonlyArray<string> {
  switch (profile) {
    case "generic-linux":
      return GENERIC_LINUX_SOURCE_PATHS;
    case "oci-agents":
      return OCI_AGENTS_SOURCE_PATHS;
    case "ubuntu-wsl":
      return UBUNTU_WSL_SOURCE_PATHS;
    default: {
      const exhaustive: never = profile;
      return exhaustive;
    }
  }
}

/** Backwards-compatible name for the default macOS setup path set. */
export const SETUP_MANIFEST_PATHS = MACOS_SOURCE_PATHS;

/** Default Windows artifacts setup materializes into the state root. */
export const WINDOWS_SETUP_MANIFEST_PATHS = [
  "packages/windows/scoop.txt",
] as const;

/** Windows artifacts selected from the configured repository route map. */
export function windowsSetupManifestPaths(routes: WindowsRoutesConfig): ReadonlyArray<string> {
  return [routes.scoopPath];
}

export interface PrefetchResult {
  path: string;
  source: "network" | "cache";
  materializedPath?: string;
  warning?: string;
}

/**
 * Fetch and materialize core manifests under stateRoot/manifests/.
 * Continues on individual failures so setup still completes.
 */
export async function prefetchSetupManifests(options: {
  config: ManagerConfig;
  paths?: ReadonlyArray<string>;
  fetcher?: ManifestFetcher;
  offline?: boolean;
}): Promise<{ ok: PrefetchResult[]; failed: Array<{ path: string; error: string }> }> {
  const ok: PrefetchResult[] = [];
  const failed: Array<{ path: string; error: string }> = [];

  for (const path of options.paths ?? SETUP_MANIFEST_PATHS) {
    try {
      const fetched = await fetchManifest({
        path,
        config: options.config,
        materialize: true,
        fetcher: options.fetcher,
        offline: options.offline,
      });
      const result: PrefetchResult = {
        path: fetched.path,
        source: fetched.source,
      };
      if (fetched.materializedPath !== undefined) {
        result.materializedPath = fetched.materializedPath;
      }
      if (fetched.warning !== undefined) {
        result.warning = fetched.warning;
      }
      ok.push(result);
    } catch (cause) {
      failed.push({
        path,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return { ok, failed };
}
