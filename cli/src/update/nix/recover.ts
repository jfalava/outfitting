import { Console, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { resolveOutfittingRepo, type OutfittingRepo } from "@/config/repo";
import { CliFailure } from "@/errors";
import { pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { which } from "@/process";
import { ui } from "@/ui";
import { activateNixSystem } from "@/update/nix/activate";
import { buildNixSystem } from "@/update/nix/build";
import {
  clearNixRecovery,
  defaultNixRecoveryDir,
  readNixRecovery,
  setNixRecoveryPhase,
} from "@/update/nix/recovery";
import { ensureNixSymlinks } from "@/update/nix/symlinks";
import { NIX_LOCK_KIND } from "@/update/nix/types";

export interface RecoverNixOptions {
  config?: ManagerConfig;
  repo?: OutfittingRepo;
  recoveryDir?: string;
  which?: typeof which;
  build?: typeof buildNixSystem;
  activate?: typeof activateNixSystem;
  push?: typeof pushLockfile;
  ensureSymlinks?: typeof ensureNixSymlinks;
}

function recoveryIfMatch(baseHash: string): string | undefined {
  return /^[0-9a-f]{64}$/i.test(baseHash) ? baseHash : undefined;
}

/** Resume a prepared nix-darwin checkpoint, then publish its lock atomically. */
export const recoverNix = (options: RecoverNixOptions = {}) =>
  Effect.gen(function* () {
    const recoveryDir = options.recoveryDir ?? defaultNixRecoveryDir();
    const state = yield* tryPromise(() => readNixRecovery(recoveryDir));
    if (state === undefined) {
      return yield* new CliFailure({
        message: `No unfinished Nix recovery checkpoint exists at ${recoveryDir}.`,
      });
    }

    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const push = options.push ?? pushLockfile;

    if (state.phase === "prepared") {
      const whichFn = options.which ?? which;
      const nixPath = yield* tryPromise(() => whichFn("nix"));
      if (nixPath === undefined) {
        return yield* new CliFailure({ message: "nix is not installed or not in PATH." });
      }

      const repo = options.repo ?? (yield* tryPromise(() => resolveOutfittingRepo({ config })));
      const ensureSymlinks = options.ensureSymlinks ?? ensureNixSymlinks;
      yield* tryPromise(() => ensureSymlinks(repo));

      const build = options.build ?? buildNixSystem;
      const activate = options.activate ?? activateNixSystem;
      yield* Console.log(ui.heading("Building the Nix recovery checkpoint…"));
      const systemConfig = yield* tryPromise(() =>
        build({
          repo,
          lockPath: state.lockPath,
          mode: "build",
        }),
      );
      yield* Console.log(ui.heading("Activating the recovered nix-darwin system…"));
      yield* tryPromise(() => activate({ systemConfig }));
      yield* tryPromise(() => setNixRecoveryPhase("activated", recoveryDir));
    }

    yield* Console.log(ui.heading("Publishing the recovered Nix lock…"));
    yield* push({
      machine: config.machineId,
      kind: NIX_LOCK_KIND,
      path: state.lockPath,
      ifMatch: recoveryIfMatch(state.baseHash),
    });
    yield* tryPromise(() => clearNixRecovery(recoveryDir));
    yield* Console.log(ui.success("Nix recovery completed successfully."));
  });
