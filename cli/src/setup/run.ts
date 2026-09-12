import { Console, Effect } from "effect";

import {
  configFilePath,
  ensureStateRoot,
  loadConfig,
  repoPathFile,
  saveConfigFile,
  tryResolveOutfittingRepo,
  writeRepoPath,
  type ManagerConfigFile,
  type ManifestSourceConfig,
} from "@/config";
import type { ManifestFetcher } from "@/fetch";
import { tryPromise } from "@/lockfiles/effect";
import { prefetchSetupManifests } from "@/setup/manifests";
import { ensureNixSymlinks } from "@/update/nix/symlinks";
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
  /** Fetch core manifests into state root (default true). */
  fetchManifests?: boolean;
  /** Skip nix-darwin / home-manager symlink ensure. */
  skipSymlinks?: boolean;
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

/**
 * Materialize state root: config, optional repo-path, core manifests, nix symlinks.
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

    if (options.repo !== undefined) {
      const written = yield* tryPromise(() =>
        writeRepoPath(options.repo!, { stateRoot: root }),
      );
      yield* Console.log(ui.success(`Repository path set to: ${written.repo.root}`));
      yield* Console.log(ui.muted(`repo-path: ${written.pathFile}`));
    }

    const config = yield* tryPromise(() => loadConfig({ stateRoot: root }));
    yield* Console.log(ui.success(`State root ready: ${config.stateRoot}`));
    yield* Console.log(ui.muted(`machine id: ${config.machineId}`));
    yield* Console.log(
      ui.muted(`manifests: ${config.manifest.baseUrl}/${config.manifest.ref}/…`),
    );
    yield* Console.log(ui.muted(`config: ${configFilePath(config.stateRoot)}`));

    const shouldFetch = options.fetchManifests !== false;
    if (shouldFetch) {
      yield* Console.log(ui.heading("Prefetching core manifests…"));
      const prefetched = yield* tryPromise(() =>
        prefetchSetupManifests({
          config,
          fetcher: options.fetcher,
          offline: options.offline,
        }),
      );
      for (const item of prefetched.ok) {
        const where = item.materializedPath ?? item.path;
        yield* Console.log(
          ui.success(`${item.path} (${item.source}) → ${where}`),
        );
        if (item.warning) {
          yield* Console.log(ui.muted(item.warning));
        }
      }
      for (const item of prefetched.failed) {
        yield* Console.log(ui.muted(`manifest ${item.path}: ${item.error}`));
      }
    }

    if (options.skipSymlinks !== true) {
      const repo = yield* tryPromise(() => tryResolveOutfittingRepo({ config }));
      if (repo !== undefined) {
        yield* tryPromise(() => ensureNixSymlinks(repo));
        yield* Console.log(
          ui.success(`nix-darwin symlinks ensured for ${repo.root}`),
        );
      } else {
        yield* Console.log(
          ui.muted(
            `No repo configured yet. Re-run with --repo /path/to/outfitting (writes ${repoPathFile(root)}).`,
          ),
        );
      }
    }

    yield* Console.log("");
    yield* Console.log(ui.muted("Next: outfitting-manager update brew|bun|nix|all"));
  });
