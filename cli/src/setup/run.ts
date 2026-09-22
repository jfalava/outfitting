import { Console, Effect } from "effect";

import {
  configFilePath,
  ensureStateRoot,
  loadConfig,
  repoPathFile,
  saveConfigFile,
  resolveWindowsRoutes,
  resolveOutfittingRepo,
  tryResolveOutfittingRepo,
  writeRepoPath,
  type ManagerConfig,
  type ManagerConfigFile,
  type ManifestSourceConfig,
} from "@/config";
import type { OutfittingRepo } from "@/config/repo";
import type { ManifestFetcher } from "@/fetch";
import { tryPromise } from "@/lockfiles/effect";
import type { HostPlatform } from "@/platform";
import { prefetchSetupManifests, windowsSetupManifestPaths } from "@/setup/manifests";
import { syncByorSparseSource, syncSparseSource, type SparseSourceResult } from "@/setup/source";
import { validateMacosSource } from "@/setup/validate";
import { ui } from "@/ui";

export interface SetupOptions {
  /** Optional machine id override written to config.json. */
  machineId?: string;
  /** Optional manifest base URL. */
  manifestBaseUrl?: string;
  /** Optional manifest ref (branch/tag/SHA). */
  manifestRef?: string;
  /** Monorepo path to persist as repo-path (set_outfitting_repo replacement). */
  repo?: string;
  /** Linux BYOR profile used when validating a repository-owned contract. */
  repoProfile?: string;
  /** Fetch core manifests into state root (default true). */
  fetchManifests?: boolean;
  /** Manifest paths to prefetch; defaults to the macOS set. */
  manifestPaths?: ReadonlyArray<string>;
  /** Use configured Windows routes when no explicit manifest paths are supplied. */
  useWindowsRoutes?: boolean;
  /** Fetch and publish a sparse source tree instead of loose manifests. */
  sourcePaths?: ReadonlyArray<string>;
  /**
   * Fetch a remote BYOR contract into the managed sparse tree.
   * Ignored when `repo` is a local checkout.
   */
  remoteByor?: HostPlatform;
  /** Override the sparse source root. */
  sourceRoot?: string;
  /** Skip nix-darwin / home-manager symlink ensure. */
  skipSymlinks?: boolean;
  /** Platform-specific symlink setup, supplied only by the macOS entrypoint. */
  ensureSymlinks?: (repo: OutfittingRepo) => Promise<void>;
  /** Validate the configured macOS repository before returning. */
  validateSource?: boolean;
  /** Command shown as the next step after setup. */
  nextCommand?: string;
  /** Override state root (tests / OUTFITTING_STATE_ROOT already handled in load). */
  stateRoot?: string;
  /** Injected fetcher for tests. */
  fetcher?: ManifestFetcher;
  offline?: boolean;
}

function buildConfigPatch(options: SetupOptions): ManagerConfigFile | undefined {
  const patch: ManagerConfigFile = {};
  if (options.machineId !== undefined) {
    patch.machineId = options.machineId;
  }
  if (options.manifestBaseUrl !== undefined || options.manifestRef !== undefined) {
    const manifest: Partial<ManifestSourceConfig> = {};
    if (options.manifestBaseUrl !== undefined) {
      manifest.baseUrl = options.manifestBaseUrl;
    }
    if (options.manifestRef !== undefined) {
      manifest.ref = options.manifestRef;
    }
    patch.manifest = manifest;
  }
  if (patch.machineId === undefined && patch.manifest === undefined) {
    return undefined;
  }
  return patch;
}

function logSparseSource(source: SparseSourceResult) {
  return Effect.gen(function* () {
    for (const item of source.files) {
      yield* Console.log(ui.success(`${item.path} (${item.source}) → ${source.root}`));
      if (item.warning) {
        yield* Console.log(ui.muted(item.warning));
      }
    }
  });
}

function setupRemoteByor(options: SetupOptions, config: ManagerConfig, root: string) {
  return Effect.gen(function* () {
    if (options.remoteByor === undefined) {
      return;
    }
    yield* Console.log(ui.heading("Fetching remote BYOR source…"));
    const source = yield* tryPromise(() =>
      syncByorSparseSource({
        config,
        platform: options.remoteByor!,
        profile: options.repoProfile,
        sourceRoot: options.sourceRoot,
        fetcher: options.fetcher,
      }),
    );
    yield* logSparseSource(source);
    const written = yield* tryPromise(() =>
      writeRepoPath(source.root, { stateRoot: root, profile: options.repoProfile }),
    );
    yield* Console.log(ui.success(`Remote BYOR source set to: ${written.repo.root}`));
    yield* Console.log(ui.muted(`repo-path: ${written.pathFile}`));
  });
}

function fetchSetupSource(options: SetupOptions, config: ManagerConfig, root: string) {
  return Effect.gen(function* () {
    if (options.remoteByor !== undefined && options.repo === undefined) {
      yield* setupRemoteByor(options, config, root);
      return;
    }
    if (options.sourcePaths !== undefined && options.repo === undefined) {
      yield* setupSparseSource(options, config, root);
      return;
    }
    yield* prefetchCoreManifests(options, config);
  });
}

function setupSparseSource(options: SetupOptions, config: ManagerConfig, root: string) {
  return Effect.gen(function* () {
    yield* Console.log(ui.heading("Fetching sparse source…"));
    const source = yield* tryPromise(() =>
      syncSparseSource({
        config,
        sourceRoot: options.sourceRoot,
        paths: options.sourcePaths,
        fetcher: options.fetcher,
        offline: options.offline,
      }),
    );
    yield* logSparseSource(source);
    const written = yield* tryPromise(() => writeRepoPath(source.root, { stateRoot: root }));
    yield* Console.log(ui.success(`Sparse source path set to: ${written.repo.root}`));
    yield* Console.log(ui.muted(`repo-path: ${written.pathFile}`));
  });
}

function prefetchCoreManifests(options: SetupOptions, config: ManagerConfig) {
  return Effect.gen(function* () {
    yield* Console.log(ui.heading("Prefetching core manifests…"));
    const prefetched = yield* tryPromise(() =>
      prefetchSetupManifests({
        config,
        paths:
          options.manifestPaths ??
          (options.useWindowsRoutes
            ? windowsSetupManifestPaths(resolveWindowsRoutes(config.windows))
            : undefined),
        fetcher: options.fetcher,
        offline: options.offline,
      }),
    );
    for (const item of prefetched.ok) {
      const where = item.materializedPath ?? item.path;
      yield* Console.log(ui.success(`${item.path} (${item.source}) → ${where}`));
      if (item.warning) {
        yield* Console.log(ui.muted(item.warning));
      }
    }
    for (const item of prefetched.failed) {
      yield* Console.log(ui.muted(`manifest ${item.path}: ${item.error}`));
    }
  });
}

/**
 * Materialize state root: config, optional repo-path, source/manifests, nix symlinks.
 * Does not clone the monorepo.
 */
export const runSetup = (options: SetupOptions = {}) =>
  Effect.gen(function* () {
    const root = yield* tryPromise(() =>
      options.stateRoot === undefined ? ensureStateRoot() : ensureStateRoot(options.stateRoot),
    );

    const patch = buildConfigPatch(options);
    if (patch !== undefined) {
      yield* tryPromise(() => saveConfigFile(patch, { stateRoot: root }));
    }

    const config = yield* tryPromise(() => loadConfig({ stateRoot: root }));
    yield* Console.log(ui.success(`State root ready: ${config.stateRoot}`));
    yield* Console.log(ui.muted(`machine id: ${config.machineId}`));
    yield* Console.log(ui.muted(`manifests: ${config.manifest.baseUrl}/${config.manifest.ref}/…`));
    yield* Console.log(ui.muted(`config: ${configFilePath(config.stateRoot)}`));

    const shouldFetch = options.fetchManifests !== false;
    if (shouldFetch) {
      yield* fetchSetupSource(options, config, root);
    }

    if (options.repo !== undefined) {
      const written = yield* tryPromise(() =>
        writeRepoPath(options.repo!, { stateRoot: root, profile: options.repoProfile }),
      );
      yield* Console.log(ui.success(`Repository path set to: ${written.repo.root}`));
      yield* Console.log(ui.muted(`repo-path: ${written.pathFile}`));
    }

    if (options.validateSource === true) {
      const repo = yield* tryPromise(() =>
        resolveOutfittingRepo({ config, profile: options.repoProfile }),
      );
      yield* tryPromise(() => validateMacosSource(repo, { profile: options.repoProfile }));
      yield* Console.log(ui.success(`macOS repository contract valid: ${repo.root}`));
    }

    if (options.ensureSymlinks !== undefined && options.skipSymlinks !== true) {
      const repo = yield* tryPromise(() => tryResolveOutfittingRepo({ config }));
      if (repo !== undefined) {
        yield* tryPromise(() => options.ensureSymlinks!(repo));
        yield* Console.log(ui.success(`nix-darwin symlinks ensured for ${repo.root}`));
      } else {
        yield* Console.log(
          ui.muted(
            `No source configured yet. Re-run setup with fetching enabled (writes ${repoPathFile(root)}).`,
          ),
        );
      }
    }

    yield* Console.log("");
    yield* Console.log(
      ui.muted(options.nextCommand ?? "Next: outfitting-manager update brew|nix|all"),
    );
  });
