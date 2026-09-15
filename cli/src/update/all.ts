import { Console, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { CliFailure } from "@/errors";
import { tryPromise } from "@/lockfiles/effect";
import { ui } from "@/ui";
import { updateBrew } from "@/update/brew";
import { updateNix } from "@/update/nix";

export interface UpdateAllOptions {
  noSync?: boolean;
  config?: ManagerConfig;
}

export interface UpdateStepResult {
  name: string;
  ok: boolean;
  error?: string;
}

/**
 * macOS `update all`: nix switch → brew.
 * Continues after step failures; exits nonzero if any step failed.
 * Brew owns default inventory push; `--no-sync` skips it.
 */
export const updateAll = (options: UpdateAllOptions = {}) =>
  Effect.gen(function* () {
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const results: UpdateStepResult[] = [];

    const runStep = <A, E, R>(
      name: string,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<void, never, R> =>
      effect.pipe(
        Effect.asVoid,
        Effect.map(() => {
          results.push({ name, ok: true });
        }),
        Effect.catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          results.push({ name, ok: false, error: message });
          return Console.log(ui.muted(`Step failed (${name}): ${message}`));
        }),
      );

    yield* Console.log(ui.heading("update all: nix switch → brew"));

    yield* runStep("nix switch", updateNix({ action: "switch", config }));
    yield* runStep("brew", updateBrew({ config, noSync: options.noSync === true }));

    const failed = results.filter((step) => !step.ok);
    yield* Console.log("");
    for (const step of results) {
      if (step.ok) {
        yield* Console.log(ui.success(step.name));
      } else {
        yield* Console.log(`${ui.heading("✗")} ${step.name}: ${step.error ?? "failed"}`);
      }
    }

    if (failed.length > 0) {
      return yield* new CliFailure({
        message: `update all finished with ${failed.length} failed step(s): ${failed
          .map((step) => step.name)
          .join(", ")}`,
      });
    }

    yield* Console.log(ui.success("update all completed successfully."));
  });
