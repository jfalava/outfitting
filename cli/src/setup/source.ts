import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { sparseSourceRoot } from "@/config/paths";
import type { ManagerConfig } from "@/config/types";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { MACOS_SOURCE_PATHS } from "@/setup/manifests";

export interface SparseSourceFile {
  path: string;
  source: "network" | "cache";
  warning?: string;
}

export interface SparseSourceResult {
  root: string;
  files: SparseSourceFile[];
}

function isAllowedSourcePath(path: string): boolean {
  return (MACOS_SOURCE_PATHS as ReadonlyArray<string>).includes(path);
}

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
 * Fetch the fixed macOS source closure and atomically publish a clean sparse
 * tree. Existing files are never used as a partially refreshed source.
 */
export async function syncMacosSource(options: {
  config: ManagerConfig;
  sourceRoot?: string;
  fetcher?: ManifestFetcher;
  offline?: boolean;
  paths?: ReadonlyArray<string>;
}): Promise<SparseSourceResult> {
  const target = options.sourceRoot ?? sparseSourceRoot(options.config.stateRoot);
  await mkdir(dirname(target), { recursive: true });
  const staged = await mkdtemp(join(dirname(target), ".outfitting-source-"));
  const files: SparseSourceFile[] = [];

  try {
    for (const path of options.paths ?? MACOS_SOURCE_PATHS) {
      if (!isAllowedSourcePath(path)) {
        throw new Error(`Refusing to fetch non-allowlisted macOS source path: ${path}`);
      }
      const fetched = await fetchManifest({
        path,
        config: options.config,
        fetcher: options.fetcher,
        offline: options.offline,
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
    return { root: target, files };
  } catch (cause) {
    await rm(staged, { recursive: true, force: true });
    throw cause;
  }
}
