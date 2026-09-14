import { Console, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { resolveOutfittingRepo, writeRepoPath, type OutfittingRepo } from "@/config/repo";
import { CliFailure } from "@/errors";
import type { ManifestFetcher } from "@/fetch";
import { tryPromise } from "@/lockfiles/effect";
import { which } from "@/process";
import { envValue } from "@/secrets";
import { syncMacosSource } from "@/setup/source";
import { ui } from "@/ui";
import { activateNixSystem } from "@/update/nix/activate";
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
}

function resolveMacosRepo(options: UpdateNixOptions, config: ManagerConfig) {
  return Effect.gen(function* () {
    if (options.repo !== undefined) {
      return options.repo;
    }
    if (envValue("OUTFITTING_REPO") !== undefined) {
      return yield* tryPromise(() => resolveOutfittingRepo({ config }));
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

/**
 * `update nix build|switch|test|dry` — no flake-input upgrade in v1.
 * switch builds then activates in-process.
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

    const repo = yield* resolveMacosRepo(options, config);

    yield* tryPromise(() => ensureNixSymlinks(repo));

    const lock = yield* tryPromise(() => openNixLock(config));
    if (lock.warning) {
      yield* Console.log(ui.muted(lock.warning));
    }

    try {
      const lockLabel = lock.usedRemote ? "remote lock" : "local flake.lock";
      switch (options.action) {
        case "build": {
          yield* Console.log(ui.heading(`Building nix-darwin system (${lockLabel})…`));
          const path = yield* tryPromise(() =>
            buildNixSystem({
              repo,
              lockPath: lock.lockPath,
              mode: "build",
            }),
          );
          yield* Console.log(ui.success(`Built ${path}`));
          break;
        }
        case "test": {
          yield* Console.log(ui.heading(`Testing nix-darwin build (${lockLabel})…`));
          yield* tryPromise(() =>
            buildNixSystem({
              repo,
              lockPath: lock.lockPath,
              mode: "test",
            }),
          );
          yield* Console.log(ui.success("Build successful — ready to switch."));
          break;
        }
        case "dry": {
          yield* Console.log(ui.heading(`Dry-run nix-darwin build (${lockLabel})…`));
          yield* tryPromise(() =>
            buildNixSystem({
              repo,
              lockPath: lock.lockPath,
              mode: "dry",
            }),
          );
          yield* Console.log(ui.success("Dry-run complete."));
          break;
        }
        case "switch": {
          yield* Console.log(ui.heading(`Building nix-darwin system (${lockLabel})…`));
          const systemConfig = yield* tryPromise(() =>
            buildNixSystem({
              repo,
              lockPath: lock.lockPath,
              mode: "build",
            }),
          );
          yield* Console.log(ui.heading("Activating nix-darwin system…"));
          yield* tryPromise(() => activateNixSystem({ systemConfig }));
          yield* Console.log(ui.success("nix-darwin switch complete."));
          break;
        }
        default: {
          const exhaustive: never = options.action;
          return exhaustive;
        }
      }
    } finally {
      yield* tryPromise(() => closeNixLock(lock.lockDir));
    }
  });
