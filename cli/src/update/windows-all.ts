import { Console, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { CliFailure } from "@/errors";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which } from "@/process";
import { ui } from "@/ui";
import { updateBun } from "@/update/bun";
import { updateScoop } from "@/update/scoop";
import {
  pushBunGlobalInventory,
  pushScoopInventory,
  pushWingetInventory,
} from "@/update/windows-snapshot";
import { updateWinget } from "@/update/winget";

export interface WindowsUpdateAllOptions {
  noSync?: boolean;
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

interface WindowsInventorySyncOptions {
  config: ManagerConfig;
  run: typeof runCommand;
  scoopPath: string | undefined;
  results: WindowsUpdateStepResult[];
  wingetUpdated: boolean;
  scoopUpdated: boolean;
  bunUpdated: boolean;
  which: typeof which;
}

const syncWindowsInventories = Effect.fn("syncWindowsInventories")(function* (
  options: WindowsInventorySyncOptions,
) {
  if (options.wingetUpdated) {
    yield* runWindowsStep(
      options.results,
      "winget inventory",
      pushWingetInventory({ config: options.config, run: options.run }),
    );
  }
  if (options.scoopUpdated) {
    yield* runWindowsStep(
      options.results,
      "scoop inventory",
      pushScoopInventory({
        config: options.config,
        run: options.run,
        scoopPath: options.scoopPath,
      }),
    );
  }
  if (options.bunUpdated && (yield* tryPromise(() => options.which("bun"))) !== undefined) {
    yield* runWindowsStep(
      options.results,
      "bun inventory",
      pushBunGlobalInventory({ config: options.config, run: options.run }),
    );
  }
});

/**
 * Windows `update all`: winget → scoop → bun → inventory sync.
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
    let bunUpdated = false;

    yield* Console.log(ui.heading("update all: winget → scoop → bun → sync"));

    yield* runWindowsStep(
      results,
      "winget",
      updateWinget({ config, noSync: true, run, which: whichFn }),
      () => {
        wingetUpdated = true;
      },
    );
    yield* runWindowsStep(
      results,
      "scoop",
      updateScoop({ config, noSync: true, run, which: whichFn, scoopPath }),
      () => {
        scoopUpdated = true;
      },
    );
    yield* runWindowsStep(
      results,
      "bun",
      updateBun({ skipIfMissing: true, run, which: whichFn }),
      () => {
        bunUpdated = true;
      },
    );

    if (options.noSync) {
      yield* Console.log(ui.muted("Skipped inventory sync (--no-sync)."));
    } else {
      yield* syncWindowsInventories({
        config,
        run,
        scoopPath,
        results,
        wingetUpdated,
        scoopUpdated,
        bunUpdated,
        which: whichFn,
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
