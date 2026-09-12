import { Effect } from "effect";
import { describe, expect, test, vi } from "vitest";

// Unit-test the continue-on-fail policy with a local replica of the reducer
// used by updateAll (avoids spawning real nix/brew/bun).

interface StepResult {
  name: string;
  ok: boolean;
  error?: string;
}

async function runSequence(
  steps: ReadonlyArray<{ name: string; effect: Effect.Effect<void, Error> }>,
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
        }).pipe(Effect.flatMap(() => Effect.fail(new Error("nix boom")))),
      },
      {
        name: "brew",
        effect: Effect.sync(() => {
          order.push("brew");
        }),
      },
      {
        name: "bun",
        effect: Effect.sync(() => {
          order.push("bun");
        }).pipe(Effect.flatMap(() => Effect.fail(new Error("bun boom")))),
      },
    ]);

    expect(order).toEqual(["nix", "brew", "bun"]);
    expect(failedNames).toEqual(["nix switch", "bun"]);
    expect(results.map((r) => r.ok)).toEqual([false, true, false]);
  });

  test("all success yields empty failed list", async () => {
    const { failedNames } = await runSequence([
      { name: "nix switch", effect: Effect.void },
      { name: "brew", effect: Effect.void },
      { name: "bun", effect: Effect.void },
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
