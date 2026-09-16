import type { ManagerConfig, WindowsRoutesConfig } from "@/config/types";
import { fetchManifest, type ManifestFetcher } from "@/fetch";

/**
 * Complete macOS source closure required to evaluate the Nix flake and load
 * the manager-owned Brewfile and Zsh plugins.
 */
export const MACOS_SOURCE_PATHS = [
  "system/macos/flake.nix",
  "system/macos/darwin.nix",
  "system/macos/home.nix",
  "system/macos/zsh/macos.plugin.zsh",
  "system/common/zsh.nix",
  "system/common/zsh/outfitting.plugin.zsh",
  "packages/common/programs.nix",
  "packages/common/packages.nix",
  "packages/macos/programs.nix",
  "packages/macos/packages.nix",
  "packages/macos/zed.nix",
  "packages/macos/Brewfile",
  "fonts/fontget.txt",
] as const;

/** Backwards-compatible name for the default macOS setup path set. */
export const SETUP_MANIFEST_PATHS = MACOS_SOURCE_PATHS;

/** Default Windows artifacts setup materializes into the state root. */
export const WINDOWS_SETUP_MANIFEST_PATHS = [
  "packages/windows/scoop.txt",
  "packages/bun.txt",
] as const;

/** Windows artifacts selected from the configured repository route map. */
export function windowsSetupManifestPaths(routes: WindowsRoutesConfig): ReadonlyArray<string> {
  return [routes.scoopPath, routes.bunPath];
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
