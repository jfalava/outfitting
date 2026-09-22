import { cp, mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { manifestCacheDir, sparseSourceRoot } from "@/config/paths";
import type { ManagerConfig } from "@/config/types";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { classifyGitHubRepository, readGitHubBlob } from "@/fetch/github";
import { runCommand } from "@/process";
import { LINUX_SOURCE_PATHS, MACOS_SOURCE_PATHS } from "@/setup/manifests";
import { localMapAsSourceFile, readByorMap, byorMapMissingError } from "@/source/byor-map";
import {
  BYOR_CONTRACT_PATH,
  linuxPathsFromProfile,
  macosPathsFromProfile,
  selectByorProfile,
  selectMacosByorProfile,
  windowsPathsFromContract,
  type ByorContract,
} from "@/source/contract";
import type { HostPlatform } from "@/platform";

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

export interface SparseSourceOptions {
  config: ManagerConfig;
  sourceRoot?: string;
  fetcher?: ManifestFetcher;
  offline?: boolean;
  paths?: ReadonlyArray<string>;
  /** Reject stale-cache fallback and stage the refresh cache with the source. */
  strict?: boolean;
}

async function stageCacheTree(cacheTarget: string, stagedCache: string | undefined): Promise<void> {
  if (stagedCache === undefined) {
    return;
  }
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

async function fetchSparseFiles(
  options: SparseSourceOptions,
  staged: string,
  stagedCache: string | undefined,
): Promise<SparseSourceFile[]> {
  const files: SparseSourceFile[] = [];
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
  return files;
}

/**
 * Fetch a fixed source closure and atomically publish a clean sparse tree.
 * Existing files are never used as a partially refreshed source.
 */
export async function syncSparseSource(options: SparseSourceOptions): Promise<SparseSourceResult> {
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

  try {
    await stageCacheTree(cacheTarget, stagedCache);
    const files = await fetchSparseFiles(options, staged, stagedCache);

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

export interface ByorSparseSourceOptions {
  config: ManagerConfig;
  platform: HostPlatform;
  /** Selected profile. Windows accepts comma-separated names. */
  profile?: string;
  sourceRoot?: string;
  fetcher?: ManifestFetcher;
  run?: typeof runCommand;
}

function byorClosure(contract: ByorContract, platform: HostPlatform, profile: string | undefined): string[] {
  switch (platform) {
    case "macos":
      return macosPathsFromProfile(selectMacosByorProfile(contract, profile).macos);
    case "linux":
      return linuxPathsFromProfile(selectByorProfile(contract, profile).linux);
    case "windows":
      return windowsPathsFromContract(
        contract,
        profile === undefined ? undefined : profile.split(","),
      );
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}

async function fetchByorPath(
  options: ByorSparseSourceOptions,
  path: string,
): Promise<Array<{ path: string; body: Uint8Array }>> {
  const repository = classifyGitHubRepository(options.config.manifest.baseUrl);
  if (repository?.transport === "gh") {
    const blobs = await readGitHubBlob({
      repository,
      ref: options.config.manifest.ref,
      path,
      run: options.run,
      fetcher: options.fetcher,
    });
    return blobs.map((blob) => ({
      path: blob.path === path || blob.path.startsWith(`${path}/`) ? blob.path : join(path, blob.path),
      body: blob.body,
    }));
  }

  const fetched = await fetchManifest({
    path,
    config: options.config,
    fetcher: options.fetcher,
    strict: true,
  });
  return [{ path, body: fetched.body }];
}

async function readLocalContract(stateRoot: string): Promise<ByorContract> {
  const contract = await readByorMap(stateRoot);
  if (contract === undefined) {
    throw new Error(byorMapMissingError());
  }
  return contract;
}

async function stageByorFiles(
  staged: string,
  options: ByorSparseSourceOptions,
  contract: ByorContract,
  paths: ReadonlyArray<string>,
): Promise<void> {
  const mapFile = localMapAsSourceFile(contract);
  await writeFile(join(staged, mapFile.path), mapFile.body);
  for (const path of paths) {
    const files = await fetchByorPath(options, path);
    for (const file of files) {
      const destination = join(staged, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, file.body);
    }
  }
}

/**
 * Fetch a remote BYOR contract and its selected platform closure into the managed sparse tree.
 * A failed file leaves the previous tree in place.
 */
export async function syncByorSparseSource(
  options: ByorSparseSourceOptions,
): Promise<SparseSourceResult> {
  const repository = classifyGitHubRepository(options.config.manifest.baseUrl);
  if (repository === undefined) {
    throw new Error(
      `Remote BYOR requires a GitHub repository URL. Configured source ${options.config.manifest.baseUrl} is not a GitHub host.`,
    );
  }

  const contract = await readLocalContract(options.config.stateRoot);
  const paths = byorClosure(contract, options.platform, options.profile);
  const target = options.sourceRoot ?? sparseSourceRoot(options.config.stateRoot);
  await mkdir(dirname(target), { recursive: true });
  const staged = await mkdtemp(join(dirname(target), ".outfitting-source-"));
  try {
    await stageByorFiles(staged, options, contract, paths);
    await replaceSourceTree(staged, target);
    return {
      root: target,
      files: [
        { path: BYOR_CONTRACT_PATH, source: "network" },
        ...paths.map((path) => ({ path, source: "network" as const })),
      ],
    };
  } catch (cause) {
    await rm(staged, { recursive: true, force: true });
    throw cause;
  }
}
