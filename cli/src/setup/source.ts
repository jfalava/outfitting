import { cp, mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { manifestCacheDir, sparseSourceRoot } from "@/config/paths";
import type { ManagerConfig } from "@/config/types";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { classifyGitHubRepository, readGitHubBlobs } from "@/fetch/github";
import type { HostPlatform } from "@/platform";
import { runCommand } from "@/process";
import { LINUX_SOURCE_PATHS, MACOS_SOURCE_PATHS } from "@/setup/manifests";
import { localMapAsSourceFile, readByorMap, byorMapMissingError } from "@/source/byor-map";
import {
  BYOR_CONTRACT_PATH,
  linuxPathsFromProfile,
  macosPathsFromProfile,
  selectByorProfile,
  selectMacosByorProfile,
  selectWindowsByorProfiles,
  readByorContract,
  windowsPathsFromContract,
  validateLinuxByorSource,
  validateMacosByorSource,
  validateWindowsByorSource,
  type ByorContract,
} from "@/source/contract";

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
  offline?: boolean;
}

function byorClosure(
  contract: ByorContract,
  platform: HostPlatform,
  profile: string | undefined,
): string[] {
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

async function readLocalContract(stateRoot: string): Promise<ByorContract> {
  const contract = await readByorMap(stateRoot);
  if (contract === undefined) {
    throw new Error(byorMapMissingError());
  }
  return contract;
}

function selectedContract(contract: ByorContract, options: ByorSparseSourceOptions): ByorContract {
  switch (options.platform) {
    case "linux": {
      const selected = selectByorProfile(contract, options.profile);
      return { schema: 1, profiles: { [selected.name]: { linux: selected.linux } } };
    }
    case "macos": {
      const selected = selectMacosByorProfile(contract, options.profile);
      return { schema: 1, profiles: { [selected.name]: { macos: selected.macos } } };
    }
    case "windows": {
      const selected = selectWindowsByorProfiles(contract, options.profile?.split(","));
      const result: ByorContract = {
        schema: 1,
        profiles: Object.fromEntries(
          selected.names.map((name) => [name, { windows: contract.profiles[name]!.windows! }]),
        ),
      };
      if (contract.windows !== undefined) {
        result.windows = { ...contract.windows, defaultProfiles: selected.names };
      }
      return result;
    }
  }
}

async function stageByorFiles(
  staged: string,
  options: ByorSparseSourceOptions,
  contract: ByorContract,
  paths: ReadonlyArray<string>,
): Promise<SparseSourceFile[]> {
  const repository = classifyGitHubRepository(options.config.manifest.baseUrl);
  if (repository === undefined) {
    throw new Error(
      `Remote BYOR requires a GitHub repository URL: ${options.config.manifest.baseUrl}.`,
    );
  }
  const files = await readGitHubBlobs({
    repository,
    ref: options.config.manifest.ref,
    paths,
    run: options.run,
    fetcher: options.fetcher,
  });
  for (const file of files) {
    if (file.path === BYOR_CONTRACT_PATH) {
      continue;
    }
    const destination = join(staged, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.body, { mode: file.mode });
  }
  // The local map owns profile selection, even when fetching a root flake.
  const mapFile = localMapAsSourceFile(contract);
  await writeFile(join(staged, mapFile.path), mapFile.body);
  return files
    .filter((file) => file.path !== BYOR_CONTRACT_PATH)
    .map((file) => ({ path: file.path, source: "network" }));
}

async function validateByorSource(root: string, options: ByorSparseSourceOptions): Promise<void> {
  switch (options.platform) {
    case "linux":
      await validateLinuxByorSource({ root, profile: options.profile });
      break;
    case "macos":
      await validateMacosByorSource({ root, profile: options.profile });
      break;
    case "windows":
      await validateWindowsByorSource({ root, profiles: options.profile?.split(",") });
      break;
  }
}

/**
 * Fetch and validate the local map's selected remote closure before replacing the managed tree.
 * Offline mode validates and reuses the existing tree without contacting GitHub.
 */
export async function syncByorSparseSource(
  options: ByorSparseSourceOptions,
): Promise<SparseSourceResult> {
  const target = options.sourceRoot ?? sparseSourceRoot(options.config.stateRoot);
  if (options.offline) {
    await validateByorSource(target, options);
    const paths = byorClosure(await readByorContract(target), options.platform, options.profile);
    return { root: target, files: paths.map((path) => ({ path, source: "cache" })) };
  }
  const contract = selectedContract(await readLocalContract(options.config.stateRoot), options);
  const paths = byorClosure(contract, options.platform, options.profile);
  await mkdir(dirname(target), { recursive: true });
  const staged = await mkdtemp(join(dirname(target), ".outfitting-source-"));
  try {
    const files = await stageByorFiles(staged, options, contract, paths);
    await validateByorSource(staged, options);
    await replaceSourceTree(staged, target);
    return { root: target, files };
  } catch (cause) {
    await rm(staged, { recursive: true, force: true });
    throw cause;
  }
}
