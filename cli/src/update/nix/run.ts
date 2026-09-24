import { access, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Console, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { resolveOutfittingRepo, writeRepoPath, type OutfittingRepo } from "@/config/repo";
import { CliFailure } from "@/errors";
import type { ManifestFetcher } from "@/fetch/github";
import { pullLockfile, pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { isGitTrackedFile } from "@/lockfiles/files";
import { which } from "@/process";
import { resolveSetupSource } from "@/setup/run";
import { syncByorSparseSource } from "@/setup/source";
import { validateLinuxByorSource, validateMacosByorSource } from "@/source/contract";
import { ui } from "@/ui";
import { isLinuxProfile, prepareLinuxSource } from "@/update/linux-source";
import { activateHomeManager, activateNixSystem } from "@/update/nix/activate";
import { buildNixSystem } from "@/update/nix/build";
import { closeNixLock, openNixLock } from "@/update/nix/lock";
import { readNixRecovery } from "@/update/nix/recovery";
import { ensureNixSymlinks } from "@/update/nix/symlinks";
import { NIX_LOCK_KIND, type NixAction } from "@/update/nix/types";

export interface UpdateNixOptions {
  action: NixAction;
  config?: ManagerConfig;
  repo?: OutfittingRepo;
  sourceFetcher?: ManifestFetcher;
  offline?: boolean;
  /** Override Linux profile used to pick the Home Manager flake. */
  profile?: string;
  /** Use the selected local source without fetching remote changes. */
  noRefresh?: boolean;
  /** Skip publishing the related Nix lock after a successful action. */
  noPush?: boolean;
}

function resolveMacosRepo(options: UpdateNixOptions, config: ManagerConfig) {
  return Effect.gen(function* () {
    if (options.repo !== undefined) {
      yield* tryPromise(() =>
        validateMacosByorSource({ root: options.repo!.root, profile: options.profile }),
      );
      return options.repo;
    }
    const selected = yield* tryPromise(() =>
      resolveSetupSource({ platform: "macos", stateRoot: config.stateRoot }),
    );
    if (selected.repo !== undefined) {
      const repo = yield* tryPromise(() =>
        resolveOutfittingRepo({ config, envRepo: selected.repo, profile: options.profile }),
      );
      yield* tryPromise(() =>
        validateMacosByorSource({ root: repo.root, profile: options.profile }),
      );
      return repo;
    }

    yield* Console.log(ui.heading("Refreshing remote macOS BYOR source…"));
    const source = yield* tryPromise(() =>
      syncByorSparseSource({
        config,
        platform: "macos",
        profile: options.profile,
        fetcher: options.sourceFetcher,
        offline: options.offline === true || options.noRefresh === true,
      }),
    );
    const written = yield* tryPromise(() =>
      writeRepoPath(source.root, { stateRoot: config.stateRoot, profile: options.profile }),
    );
    return written.repo;
  });
}

function missingLinuxFlake(profile: string): CliFailure {
  return new CliFailure({
    message: `BYOR Linux profile \`${profile}\` does not declare a Nix flake.`,
  });
}

function requireLinuxFlakeRepo(
  repo: OutfittingRepo,
  profile: string,
): Effect.Effect<OutfittingRepo, CliFailure> {
  if (repo.flakeKind === "none" || repo.flakePath.length === 0) {
    return Effect.fail(missingLinuxFlake(profile));
  }
  return Effect.succeed(repo);
}

function resolveLinuxNixRepo(options: UpdateNixOptions, config: ManagerConfig) {
  return Effect.gen(function* () {
    const profile = options.profile ?? config.linux?.profile;
    if (profile === undefined) {
      return yield* new CliFailure({
        message: "No Linux BYOR profile is selected. Run init --profile <name> or pass --profile.",
      });
    }
    if (!isLinuxProfile(profile)) {
      return yield* new CliFailure({
        message: `Invalid Linux profile \`${profile}\`.`,
      });
    }
    const source = yield* tryPromise(() =>
      prepareLinuxSource({
        config,
        profile,
        refresh: options.noRefresh !== true,
        offline: options.offline,
        fetcher: options.sourceFetcher,
      }),
    );
    if (source.repo === undefined) {
      return yield* missingLinuxFlake(profile);
    }
    const validated = yield* tryPromise(() =>
      validateLinuxByorSource({ root: source.root, profile }),
    );
    if (validated.linux.nix === undefined) {
      return yield* missingLinuxFlake(profile);
    }
    return yield* requireLinuxFlakeRepo(source.repo, profile);
  });
}

function resolveActiveRepo(options: UpdateNixOptions, config: ManagerConfig) {
  if (process.platform === "darwin") {
    if (options.repo !== undefined) {
      return Effect.succeed(options.repo);
    }
    return resolveMacosRepo(options, config);
  }
  return resolveLinuxNixRepo(options, config);
}

function nixTargetLabel(repo: OutfittingRepo): string {
  switch (repo.flakeKind) {
    case "macos":
      return "nix-darwin system";
    case "home-manager":
      return `Home Manager (${repo.homeManagerName ?? "profile"})`;
    case "none":
      return "Nix profile";
    default: {
      const exhaustive: never = repo.flakeKind;
      return exhaustive;
    }
  }
}

async function localFlakeLockPath(repo: OutfittingRepo): Promise<string | undefined> {
  if (repo.flakePath.length === 0) {
    return undefined;
  }
  const lockPath = join(repo.flakePath, "flake.lock");
  try {
    await access(lockPath);
    return lockPath;
  } catch {
    return undefined;
  }
}

async function stageNixLockForPush(lockPath: string): Promise<{
  path: string;
  directory?: string;
}> {
  if (!(await isGitTrackedFile(lockPath))) {
    return { path: lockPath };
  }

  const directory = await mkdtemp(join(tmpdir(), "outfitting-nix-push-"));
  const path = join(directory, "flake.lock");
  try {
    await copyFile(lockPath, path);
    return { path, directory };
  } catch (cause) {
    await rm(directory, { force: true, recursive: true });
    throw cause;
  }
}

function openActionLock(repo: OutfittingRepo, config: ManagerConfig) {
  return Effect.gen(function* () {
    if (repo.flakeKind === "macos") {
      const fallbackPath = yield* tryPromise(() => localFlakeLockPath(repo));
      const lock = yield* tryPromise(() =>
        openNixLock(config, pullLockfile, {
          fallbackPath,
          allowMissing: true,
        }),
      );
      return {
        lockPath: lock.lockPath.length > 0 ? lock.lockPath : undefined,
        lockDir: lock.lockDir.length > 0 ? lock.lockDir : undefined,
        warning: lock.warning,
      };
    }
    // Home Manager: prefer the flake's checked-in lock (matches bootstrap).
    const lockPath = yield* tryPromise(() => localFlakeLockPath(repo));
    return { lockPath, lockDir: undefined as string | undefined, warning: undefined };
  });
}

function runNixAction(
  action: NixAction,
  repo: OutfittingRepo,
  lockPath: string | undefined,
  label: string,
) {
  return Effect.gen(function* () {
    switch (action) {
      case "build": {
        yield* Console.log(ui.heading(`Building ${label}…`));
        const path = yield* tryPromise(() => buildNixSystem({ repo, lockPath, mode: "build" }));
        yield* Console.log(ui.success(`Built ${path}`));
        return;
      }
      case "test": {
        yield* Console.log(ui.heading(`Testing ${label} build…`));
        yield* tryPromise(() => buildNixSystem({ repo, lockPath, mode: "test" }));
        yield* Console.log(ui.success("Build successful — ready to switch."));
        return;
      }
      case "dry": {
        yield* Console.log(ui.heading(`Dry-run ${label} build…`));
        yield* tryPromise(() => buildNixSystem({ repo, lockPath, mode: "dry" }));
        yield* Console.log(ui.success("Dry-run complete."));
        return;
      }
      case "switch": {
        yield* Console.log(ui.heading(`Building ${label}…`));
        const systemConfig = yield* tryPromise(() =>
          buildNixSystem({ repo, lockPath, mode: "build" }),
        );
        if (repo.flakeKind === "home-manager") {
          yield* Console.log(ui.heading("Activating Home Manager…"));
          const env: NodeJS.ProcessEnv = {
            ...process.env,
            OUTFITTING_REPO: repo.root,
          };
          yield* tryPromise(() => activateHomeManager({ activationPackage: systemConfig, env }));
          yield* Console.log(ui.success("Home Manager switch complete."));
          return;
        }
        yield* Console.log(ui.heading("Activating nix-darwin system…"));
        yield* tryPromise(() => activateNixSystem({ systemConfig }));
        yield* Console.log(ui.success("nix-darwin switch complete."));
        return;
      }
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  });
}

function validateLinuxNixProfile(
  options: UpdateNixOptions,
  config: ManagerConfig,
): Effect.Effect<void, CliFailure> {
  if (process.platform === "darwin" || options.repo !== undefined) {
    return Effect.void;
  }
  const profile = options.profile ?? config.linux?.profile;
  if (profile === undefined) {
    return Effect.fail(
      new CliFailure({
        message: "No Linux BYOR profile is selected. Run init --profile <name> or pass --profile.",
      }),
    );
  }
  if (!isLinuxProfile(profile)) {
    return Effect.fail(new CliFailure({ message: `Invalid Linux profile \`${profile}\`.` }));
  }
  return Effect.void;
}

/**
 * `update nix build|switch|test|dry` — no flake-input upgrade in v1.
 * switch builds then activates in-process.
 * macOS prefers the remote canonical lock and bootstraps from the local/generated lock when needed;
 * Home Manager uses the flake's local lock.
 */
export const updateNix = (options: UpdateNixOptions) =>
  Effect.gen(function* () {
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));

    // Validate the selected BYOR profile before probing Nix.
    yield* validateLinuxNixProfile(options, config);

    const nixPath = yield* tryPromise(() => which("nix"));
    if (nixPath === undefined) {
      return yield* new CliFailure({ message: "nix is not installed or not in PATH." });
    }

    const recovery = yield* tryPromise(() => readNixRecovery());
    if (recovery !== undefined) {
      return yield* new CliFailure({
        message: `An unfinished Nix recovery checkpoint exists at ${recovery.dir}. Run: outfit recover nix`,
      });
    }

    const repo = yield* resolveActiveRepo(options, config);
    if (repo.flakeKind === "none" || repo.flakePath.length === 0) {
      return yield* new CliFailure({
        message: "The selected BYOR source does not declare a Nix flake.",
      });
    }

    yield* tryPromise(() => ensureNixSymlinks(repo));
    yield* runNixActionWithPublish(options, config, repo);
  });

function runNixActionWithPublish(
  options: UpdateNixOptions,
  config: ManagerConfig,
  repo: OutfittingRepo,
) {
  return Effect.gen(function* () {
    const { lockPath, lockDir, warning } = yield* openActionLock(repo, config);
    let stagedLockDir: string | undefined;
    try {
      if (warning !== undefined) {
        yield* Console.log(ui.muted(warning));
      }
      yield* runNixAction(options.action, repo, lockPath, nixTargetLabel(repo));

      if (options.noPush === true) {
        yield* Console.log(ui.muted("Skipped Nix lock upload (--no-push)."));
        return;
      }

      const publishPath = lockPath ?? (yield* tryPromise(() => localFlakeLockPath(repo)));
      if (publishPath === undefined) {
        return yield* new CliFailure({
          message: "Nix action succeeded but no flake.lock was available to publish.",
        });
      }
      const stagedLock = yield* tryPromise(() => stageNixLockForPush(publishPath));
      stagedLockDir = stagedLock.directory;
      yield* Console.log(ui.heading(`Publishing ${config.machineId}/${NIX_LOCK_KIND}…`));
      yield* pushLockfile({
        machine: config.machineId,
        kind: NIX_LOCK_KIND,
        path: stagedLock.path,
      });
    } finally {
      const cleanupLockDir = stagedLockDir;
      if (cleanupLockDir !== undefined) {
        yield* tryPromise(() => rm(cleanupLockDir, { force: true, recursive: true }));
      }
      if (lockDir !== undefined) {
        yield* tryPromise(() => closeNixLock(lockDir));
      }
    }
  });
}
