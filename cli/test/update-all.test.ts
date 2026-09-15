import { Effect } from "effect";
import { describe, expect, test, vi } from "vitest";

import { CliFailure } from "@/errors";

// Unit-test the continue-on-fail policy with a local replica of the reducer
// used by updateAll (avoids spawning real nix/brew).

interface StepResult {
  name: string;
  ok: boolean;
  error?: string;
}

async function runSequence(
  steps: ReadonlyArray<{ name: string; effect: Effect.Effect<void, CliFailure> }>,
): Promise<{ results: StepResult[]; failedNames: string[] }> {
  const results: StepResult[] = [];
  for (const step of steps) {
    await Effect.runPromise(
      step.effect.pipe(
        Effect.map(() => {
          results.push({ name: step.name, ok: true });
        }),
        Effect.catch((error) =>
          Effect.sync(() => {
            results.push({
              name: step.name,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }),
        ),
      ),
    );
  }
  return {
    results,
    failedNames: results.filter((r) => !r.ok).map((r) => r.name),
  };
}

describe("update all continue-on-fail policy", () => {
  test("runs later steps after an early failure and reports all failures", async () => {
    const order: string[] = [];
    const { results, failedNames } = await runSequence([
      {
        name: "nix switch",
        effect: Effect.sync(() => {
          order.push("nix");
        }).pipe(Effect.flatMap(() => Effect.fail(new CliFailure({ message: "nix boom" })))),
      },
      {
        name: "brew",
        effect: Effect.sync(() => {
          order.push("brew");
        }),
      },
    ]);

    expect(order).toEqual(["nix", "brew"]);
    expect(failedNames).toEqual(["nix switch"]);
    expect(results.map((r) => r.ok)).toEqual([false, true]);
  });

  test("all success yields empty failed list", async () => {
    const { failedNames } = await runSequence([
      { name: "nix switch", effect: Effect.void },
      { name: "brew", effect: Effect.void },
    ]);
    expect(failedNames).toEqual([]);
  });
});

describe("update all command wiring smoke", () => {
  test("module exports updateAll", async () => {
    const mod = await import("@/update/all");
    expect(typeof mod.updateAll).toBe("function");
    void vi;
  });
});
