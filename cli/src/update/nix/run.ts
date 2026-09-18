import { access } from "node:fs/promises";
import { join } from "node:path";

import { Console, Effect } from "effect";

import { loadConfig, sparseSourceRoot, type ManagerConfig } from "@/config";
import {
  physicalPath,
  readRepoPathFile,
  resolveOutfittingRepo,
  writeRepoPath,
  type OutfittingRepo,
} from "@/config/repo";
import { CliFailure } from "@/errors";
import type { ManifestFetcher } from "@/fetch";
import { tryPromise } from "@/lockfiles/effect";
import { which } from "@/process";
import { envValue } from "@/secrets";
import { syncMacosSource } from "@/setup/source";
import { ui } from "@/ui";
import { activateHomeManager, activateNixSystem } from "@/update/nix/activate";
import { buildNixSystem } from "@/update/nix/build";
import { closeNixLock, openNixLock } from "@/update/nix/lock";
import { readNixRecovery } from "@/update/nix/recovery";
import { ensureNixSymlinks } from "@/update/nix/symlinks";
import type { NixAction } from "@/update/nix/types";

export interface UpdateNixOptions {
  action: NixAction;
  config?: ManagerConfig;
  repo?: OutfittingRepo;
  sourceFetcher?: ManifestFetcher;
  offline?: boolean;
  /** Override Linux profile used to pick the Home Manager flake. */
  profile?: string;
}

function resolveMacosRepo(options: UpdateNixOptions, config: ManagerConfig) {
  return Effect.gen(function* () {
    if (options.repo !== undefined) {
      return options.repo;
    }
    if (envValue("OUTFITTING_REPO") !== undefined) {
      return yield* tryPromise(() => resolveOutfittingRepo({ config }));
    }

    const saved = yield* tryPromise(() => readRepoPathFile(config));
    if (saved !== undefined) {
      const managedRoot = sparseSourceRoot(yield* tryPromise(() => physicalPath(config.stateRoot)));
      if (saved !== managedRoot) {
        return yield* tryPromise(() => resolveOutfittingRepo({ config }));
      }
    }

    yield* Console.log(ui.heading("Refreshing sparse macOS source…"));
    const source = yield* tryPromise(() =>
      syncMacosSource({
        config,
        fetcher: options.sourceFetcher,
        offline: options.offline,
      }),
    );
    const written = yield* tryPromise(() =>
      writeRepoPath(source.root, { stateRoot: config.stateRoot }),
    );
    return written.repo;
  });
}

function resolveLinuxNixRepo(options: UpdateNixOptions, config: ManagerConfig) {
  return Effect.gen(function* () {
    if (options.repo !== undefined) {
      return options.repo;
    }
    const profile = options.profile ?? config.linux?.profile;
    return yield* tryPromise(() => resolveOutfittingRepo({ config, profile }));
  });
}

function resolveActiveRepo(options: UpdateNixOptions, config: ManagerConfig) {
  if (options.repo !== undefined) {
    return Effect.succeed(options.repo);
  }
  if (process.platform === "darwin") {
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

function openActionLock(repo: OutfittingRepo, config: ManagerConfig) {
  return Effect.gen(function* () {
    if (repo.flakeKind === "macos") {
      const lock = yield* tryPromise(() => openNixLock(config));
      return { lockPath: lock.lockPath, lockDir: lock.lockDir };
    }
    // Home Manager: prefer the flake's checked-in lock (matches bootstrap).
    const lockPath = yield* tryPromise(() => localFlakeLockPath(repo));
    return { lockPath, lockDir: undefined as string | undefined };
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
        const path = yield* tryPromise(() =>
          buildNixSystem({ repo, lockPath, mode: "build" }),
        );
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

/**
 * `update nix build|switch|test|dry` — no flake-input upgrade in v1.
 * switch builds then activates in-process.
 * macOS uses the remote canonical lock; Home Manager uses the flake's local lock.
 */
export const updateNix = (options: UpdateNixOptions) =>
  Effect.gen(function* () {
    const nixPath = yield* tryPromise(() => which("nix"));
    if (nixPath === undefined) {
      return yield* new CliFailure({ message: "nix is not installed or not in PATH." });
    }

    const config = options.config ?? (yield* tryPromise(() => loadConfig()));

    const recovery = yield* tryPromise(() => readNixRecovery());
    if (recovery !== undefined) {
      return yield* new CliFailure({
        message: `An unfinished Nix recovery checkpoint exists at ${recovery.dir}. Run: outfit recover nix`,
      });
    }

    const repo = yield* resolveActiveRepo(options, config);
    if (repo.flakeKind === "none" || repo.flakePath.length === 0) {
      return yield* new CliFailure({
        message:
          "No Nix flake for this machine. Set linux.profile to oci-agents or ubuntu-wsl, or use a macOS source.",
      });
    }

    yield* tryPromise(() => ensureNixSymlinks(repo));

    const { lockPath, lockDir } = yield* openActionLock(repo, config);
    try {
      yield* runNixAction(options.action, repo, lockPath, nixTargetLabel(repo));
    } finally {
      if (lockDir !== undefined) {
        yield* tryPromise(() => closeNixLock(lockDir));
      }
    }
  });
