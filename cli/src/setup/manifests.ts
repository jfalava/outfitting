import type { ManagerConfig } from "@/config/types";
import { fetchManifest, type ManifestFetcher } from "@/fetch";

/** Named monorepo artifacts setup materializes into the state root. */
export const SETUP_MANIFEST_PATHS = [
  "packages/macos/Brewfile",
  "packages/bun.txt",
] as const;

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
  fetcher?: ManifestFetcher;
  offline?: boolean;
}): Promise<{ ok: PrefetchResult[]; failed: Array<{ path: string; error: string }> }> {
  const ok: PrefetchResult[] = [];
  const failed: Array<{ path: string; error: string }> = [];

  for (const path of SETUP_MANIFEST_PATHS) {
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
