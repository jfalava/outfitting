import { cp, mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { manifestCacheDir, sparseSourceRoot } from "@/config/paths";
import type { ManagerConfig } from "@/config/types";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { LINUX_SOURCE_PATHS, MACOS_SOURCE_PATHS } from "@/setup/manifests";

export interface SparseSourceFile {
  path: string;
  source: "network" | "cache";
  warning?: string;
}

export interface SparseSourceResult {
  root: string;
  files: SparseSourceFile[];
}

const ALLOWED_SOURCE_PATHS = new Set<string>([...MACOS_SOURCE_PATHS, ...LINUX_SOURCE_PATHS]);

function isNotFound(cause: unknown): boolean {
  return (
    cause instanceof Error && "code" in cause && (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function replaceSourceTree(staged: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const backup = await mkdtemp(join(dirname(target), ".outfitting-source-backup-"));
  await rm(backup, { recursive: true, force: true });

  let movedExisting = false;
  try {
    try {
      await rename(target, backup);
      movedExisting = true;
    } catch (cause) {
      if (!isNotFound(cause)) {
        throw cause;
      }
    }

    await rename(staged, target);
    if (movedExisting) {
      await rm(backup, { recursive: true, force: true });
    }
  } catch (cause) {
    if (movedExisting) {
      try {
        await rename(backup, target);
      } catch {
        // Preserve the original failure; the backup remains for manual recovery.
      }
    }
    throw cause;
  } finally {
    await rm(staged, { recursive: true, force: true });
    if (!movedExisting) {
      await rm(backup, { recursive: true, force: true });
    }
  }
}

/**
 * Fetch a fixed source closure and atomically publish a clean sparse tree.
 * Existing files are never used as a partially refreshed source.
 */
export async function syncSparseSource(options: {
  config: ManagerConfig;
  sourceRoot?: string;
  fetcher?: ManifestFetcher;
  offline?: boolean;
  paths?: ReadonlyArray<string>;
  /** Reject stale-cache fallback and stage the refresh cache with the source. */
  strict?: boolean;
}): Promise<SparseSourceResult> {
  const target = options.sourceRoot ?? sparseSourceRoot(options.config.stateRoot);
  const cacheTarget = manifestCacheDir(options.config.stateRoot);
  await mkdir(dirname(target), { recursive: true });
  if (options.strict) {
    await mkdir(dirname(cacheTarget), { recursive: true });
  }
  const staged = await mkdtemp(join(dirname(target), ".outfitting-source-"));
  const stagedCache = options.strict
    ? await mkdtemp(join(dirname(cacheTarget), ".outfitting-cache-"))
    : undefined;
  const files: SparseSourceFile[] = [];

  try {
    if (stagedCache !== undefined) {
      await rm(stagedCache, { recursive: true, force: true });
      try {
        await cp(cacheTarget, stagedCache, { recursive: true });
      } catch (cause) {
        if (!isNotFound(cause)) {
          throw cause;
        }
        await mkdir(stagedCache, { recursive: true });
      }
    }
    for (const path of options.paths ?? MACOS_SOURCE_PATHS) {
      if (!ALLOWED_SOURCE_PATHS.has(path)) {
        throw new Error(`Refusing to fetch non-allowlisted source path: ${path}`);
      }
      const fetched = await fetchManifest({
        path,
        config: options.config,
        materialize: options.strict !== true,
        fetcher: options.fetcher,
        offline: options.offline,
        strict: options.strict,
        cacheRoot: stagedCache,
      });
      const destination = join(staged, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, fetched.body);
      const file: SparseSourceFile = { path: fetched.path, source: fetched.source };
      if (fetched.warning !== undefined) {
        file.warning = fetched.warning;
      }
      files.push(file);
    }

    await replaceSourceTree(staged, target);
    if (stagedCache !== undefined) {
      await replaceSourceTree(stagedCache, cacheTarget);
    }
    return { root: target, files };
  } catch (cause) {
    await rm(staged, { recursive: true, force: true });
    if (stagedCache !== undefined) {
      await rm(stagedCache, { recursive: true, force: true });
    }
    throw cause;
  }
}

/** Backwards-compatible macOS name for the shared sparse-source synchronizer. */
export const syncMacosSource = syncSparseSource;
