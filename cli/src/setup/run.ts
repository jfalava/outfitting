import { Console, Effect } from "effect";

import {
  byorMapPath,
  configFilePath,
  ensureStateRoot,
  loadConfig,
  saveConfigFile,
  writeRepoPath,
  type OutfittingRepo,
} from "@/config";
import { sparseSourceRoot } from "@/config/paths";
import { physicalPath, readRepoPathFile } from "@/config/repo";
import type { ManifestFetcher } from "@/fetch/github";
import { tryPromise } from "@/lockfiles/effect";
import type { HostPlatform } from "@/platform";
import type { runCommand } from "@/process";
import { envValue } from "@/secrets";
import { syncByorSparseSource } from "@/setup/source";
import { readByorMap } from "@/source/byor-map";
import {
  validateLinuxByorSource,
  validateMacosByorSource,
  validateWindowsByorSource,
} from "@/source/contract";
import { ui } from "@/ui";

export interface SetupOptions {
  /** Explicit platform for platform-specific entrypoints, including cross-platform tests. */
  platform?: HostPlatform;
  machineId?: string;
  /** Selected local checkout. It takes precedence over byor.json and is never fetched. */
  repo?: string;
  /** Profile used to select and validate repository-owned configuration. */
  repoProfile?: string;
  /** Refresh the configured remote Git source; defaults to true. */
  refreshSource?: boolean;
  sourceRoot?: string;
  skipSymlinks?: boolean;
  ensureSymlinks?: (repo: OutfittingRepo) => Promise<void>;
  nextCommand?: string;
  stateRoot?: string;
  fetcher?: ManifestFetcher;
  run?: typeof runCommand;
  offline?: boolean;
}

/** Resolve a selected local checkout or require a configured remote BYOR source. */
export async function resolveSetupSource(options: SetupOptions): Promise<SetupOptions> {
  const config = await loadConfig({ stateRoot: options.stateRoot });
  const explicitRepo = options.repo ?? envValue("OUTFITTING_REPO");
  const saved = explicitRepo === undefined ? await readRepoPathFile(config) : undefined;
  const managed =
    saved === undefined ? undefined : sparseSourceRoot(await physicalPath(config.stateRoot));
  const repo = explicitRepo ?? (saved === managed ? undefined : saved);
  const platform =
    options.platform ??
    (process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux");

  if (repo !== undefined) {
    return { ...options, repo, platform };
  }
  if ((await readByorMap(config.stateRoot)) === undefined) {
    throw new Error(
      `No local outfitting.json checkout or remote source is configured. Set OUTFITTING_REPO or run \`outfitting-manager byor\` (see ${byorMapPath(config.stateRoot)}).`,
    );
  }
  return { ...options, repo: undefined, platform };
}

/** Materialize the selected source, state root, config, and optional nix symlinks. */
export const runSetup = (input: SetupOptions = {}) =>
  Effect.gen(function* () {
    const options = yield* tryPromise(() => resolveSetupSource(input));
    const root = yield* tryPromise(() =>
      options.stateRoot === undefined ? ensureStateRoot() : ensureStateRoot(options.stateRoot),
    );
    if (options.machineId !== undefined) {
      yield* tryPromise(() =>
        saveConfigFile({ machineId: options.machineId }, { stateRoot: root }),
      );
    }
    const config = yield* tryPromise(() => loadConfig({ stateRoot: root }));
    yield* Console.log(ui.success(`State root ready: ${config.stateRoot}`));
    yield* Console.log(ui.muted(`machine id: ${config.machineId}`));
    yield* Console.log(ui.muted(`config: ${configFilePath(config.stateRoot)}`));

    let selectedRepo = options.repo;
    if (selectedRepo === undefined) {
      yield* Console.log(
        ui.heading(
          options.refreshSource === false || options.offline === true
            ? "Validating cached source…"
            : "Refreshing remote source…",
        ),
      );
      const source = yield* tryPromise(() =>
        syncByorSparseSource({
          config,
          platform: options.platform!,
          profile: options.repoProfile,
          sourceRoot: options.sourceRoot,
          fetcher: options.fetcher,
          run: options.run,
          offline: options.offline || options.refreshSource === false,
        }),
      );
      selectedRepo = source.root;
      for (const item of source.files) {
        yield* Console.log(ui.success(`${item.path} (${item.source}) → ${source.root}`));
      }
    }

    const platform = options.platform!;
    yield* tryPromise(async () => {
      if (platform === "macos") {
        await validateMacosByorSource({ root: selectedRepo!, profile: options.repoProfile });
      } else if (platform === "linux") {
        await validateLinuxByorSource({ root: selectedRepo!, profile: options.repoProfile });
      } else {
        await validateWindowsByorSource({
          root: selectedRepo!,
          profiles: options.repoProfile?.split(","),
        });
      }
    });

    const written = yield* tryPromise(() =>
      writeRepoPath(selectedRepo!, {
        stateRoot: root,
        profile: platform === "windows" ? undefined : options.repoProfile,
      }),
    );
    yield* Console.log(ui.success(`Source path set to: ${written.repo.root}`));
    yield* Console.log(ui.muted(`repo-path: ${written.pathFile}`));

    if (options.ensureSymlinks !== undefined && options.skipSymlinks !== true) {
      yield* tryPromise(() => options.ensureSymlinks!(written.repo));
      yield* Console.log(ui.success(`nix-darwin symlinks ensured for ${written.repo.root}`));
    }

    yield* Console.log("");
    yield* Console.log(
      ui.muted(options.nextCommand ?? "Next: outfitting-manager update brew|nix|all"),
    );
  });
