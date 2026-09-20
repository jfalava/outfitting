import { Console, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { CliFailure } from "@/errors";
import { pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which } from "@/process";
import { ui } from "@/ui";
import { updateScoop } from "@/update/scoop";
import { WINDOWS_LOCK_KIND, windowsLockPath } from "@/update/windows-lock";
import { updateWinget } from "@/update/winget";

export interface WindowsUpdateAllOptions {
  noPush?: boolean;
  config?: ManagerConfig;
  run?: typeof runCommand;
  which?: typeof which;
}

export interface WindowsUpdateStepResult {
  name: string;
  ok: boolean;
  error?: string;
}

function runWindowsStep<A, E>(
  results: WindowsUpdateStepResult[],
  name: string,
  effect: Effect.Effect<A, E, never>,
  markSuccess?: () => void,
): Effect.Effect<void> {
  return effect.pipe(
    Effect.asVoid,
    Effect.map(() => {
      results.push({ name, ok: true });
      markSuccess?.();
    }),
    Effect.catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ name, ok: false, error: message });
      return Console.log(ui.muted(`Step failed (${name}): ${message}`));
    }),
  );
}

const printWindowsResults = Effect.fn("printWindowsResults")(function* (
  results: ReadonlyArray<WindowsUpdateStepResult>,
) {
  yield* Console.log("");
  for (const step of results) {
    if (step.ok) {
      yield* Console.log(ui.success(step.name));
    } else {
      yield* Console.log(`${ui.heading("✗")} ${step.name}: ${step.error ?? "failed"}`);
    }
  }
});

interface WindowsInventoryPushOptions {
  config: ManagerConfig;
  results: WindowsUpdateStepResult[];
  wingetUpdated: boolean;
  scoopUpdated: boolean;
}

const pushWindowsLock = Effect.fn("pushWindowsLock")(function* (
  options: WindowsInventoryPushOptions,
) {
  if (!options.wingetUpdated && !options.scoopUpdated) {
    return;
  }
  yield* runWindowsStep(
    options.results,
    "windows lock upload",
    pushLockfile({
      machine: options.config.machineId,
      kind: WINDOWS_LOCK_KIND,
      path: windowsLockPath({ root: options.config.stateRoot }),
    }),
  );
});

/**
 * Windows `update all`: winget → scoop → unified lock sync.
 * Continues after failures and exits nonzero when any update or sync fails.
 */
export const updateWindowsAll = (options: WindowsUpdateAllOptions = {}) =>
  Effect.gen(function* () {
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const run = options.run ?? runCommand;
    const whichFn = options.which ?? which;
    const scoopPath = yield* tryPromise(() => whichFn("scoop"));
    const results: WindowsUpdateStepResult[] = [];
    let wingetUpdated = false;
    let scoopUpdated = false;

    yield* Console.log(ui.heading("update all: winget → scoop → sync"));

    yield* runWindowsStep(
      results,
      "winget",
      updateWinget({ config, noPush: true, run, which: whichFn }),
      () => {
        wingetUpdated = true;
      },
    );
    yield* runWindowsStep(
      results,
      "scoop",
      updateScoop({ config, noPush: true, run, which: whichFn, scoopPath }),
      () => {
        scoopUpdated = true;
      },
    );
    if (options.noPush) {
      yield* Console.log(ui.muted("Updated local Windows state; skipped upload (--no-push)."));
    } else {
      yield* pushWindowsLock({
        config,
        results,
        wingetUpdated,
        scoopUpdated,
      });
    }

    yield* printWindowsResults(results);

    const failed = results.filter((step) => !step.ok);
    if (failed.length > 0) {
      return yield* new CliFailure({
        message: `update all finished with ${failed.length} failed step(s): ${failed
          .map((step) => step.name)
          .join(", ")}`,
      });
    }

    yield* Console.log(ui.success("Windows update all completed successfully."));
  });
