import { Console, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
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

    const runStep = <A, E>(
      name: string,
      effect: Effect.Effect<A, E, never>,
      markSuccess?: () => void,
    ): Effect.Effect<void> =>
      effect.pipe(
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

    yield* Console.log(ui.heading("update all: winget → scoop → bun → sync"));

    yield* runStep("winget", updateWinget({ config, noSync: true, run, which: whichFn }), () => {
      wingetUpdated = true;
    });
    yield* runStep(
      "scoop",
      updateScoop({ config, noSync: true, run, which: whichFn, scoopPath }),
      () => {
        scoopUpdated = true;
      },
    );
    yield* runStep("bun", updateBun({ skipIfMissing: true, run, which: whichFn }), () => {
      bunUpdated = true;
    });

    if (options.noSync) {
      yield* Console.log(ui.muted("Skipped inventory sync (--no-sync)."));
    } else {
      if (wingetUpdated) {
        yield* runStep("winget inventory", pushWingetInventory({ config, run }));
      }
      if (scoopUpdated) {
        yield* runStep("scoop inventory", pushScoopInventory({ config, run, scoopPath }));
      }
      if (bunUpdated && (yield* tryPromise(() => whichFn("bun"))) !== undefined) {
        yield* runStep("bun inventory", pushBunGlobalInventory({ config, run }));
      }
    }

    yield* Console.log("");
    for (const step of results) {
      if (step.ok) {
        yield* Console.log(ui.success(step.name));
      } else {
        yield* Console.log(`${ui.heading("✗")} ${step.name}: ${step.error ?? "failed"}`);
      }
    }

    const failed = results.filter((step) => !step.ok);
    if (failed.length > 0) {
      return yield* Effect.fail(
        new Error(
          `update all finished with ${failed.length} failed step(s): ${failed
            .map((step) => step.name)
            .join(", ")}`,
        ),
      );
    }

    yield* Console.log(ui.success("Windows update all completed successfully."));
  });
