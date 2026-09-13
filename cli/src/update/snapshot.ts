import { Console, Data, Effect, FileSystem, Path } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand } from "@/process";
import { ui } from "@/ui";

export const HOMEBREW_INVENTORY_KIND = "homebrew-inventory";
export const HOMEBREW_INVENTORY_HEADER = "outfitting-homebrew-inventory-v1";

class HomebrewInventoryError extends Data.TaggedError("HomebrewInventoryError")<{
  readonly message: string;
}> {}

function sortLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .toSorted((a, b) => a.localeCompare(b, "en"))
    .join("\n");
}

export const captureHomebrewInventory = Effect.fn("captureHomebrewInventory")(function* (
  run: typeof runCommand = runCommand,
) {
  const [taps, formulae, casks] = yield* Effect.all(
    [
      tryPromise(() => run("brew", ["tap"], { inherit: false })),
      tryPromise(() => run("brew", ["list", "--formula", "--versions"], { inherit: false })),
      tryPromise(() => run("brew", ["list", "--cask", "--versions"], { inherit: false })),
    ],
    { concurrency: "unbounded" },
  );

  for (const result of [taps, formulae, casks]) {
    if (result.code !== 0) {
      return yield* Effect.fail(
        new HomebrewInventoryError({
          message:
            `Failed to capture Homebrew inventory (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
        }),
      );
    }
  }

  return [
    HOMEBREW_INVENTORY_HEADER,
    "",
    "[taps]",
    sortLines(taps.stdout),
    "",
    "[formulae]",
    sortLines(formulae.stdout),
    "",
    "[casks]",
    sortLines(casks.stdout),
    "",
  ].join("\n");
});

export interface PushHomebrewInventoryOptions {
  config?: ManagerConfig;
  run?: typeof runCommand;
}

/** Gather versioned Homebrew inventory and push via lockfiles Worker. */
export const pushHomebrewInventory = (options: PushHomebrewInventoryOptions = {}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const run = options.run ?? runCommand;
      const config = options.config ?? (yield* tryPromise(() => loadConfig()));

      yield* Console.log(ui.heading("Capturing Homebrew inventory…"));
      const body = yield* captureHomebrewInventory(run);

      const snapshotDir = yield* fs.makeTempDirectoryScoped({ prefix: "outfitting-snapshot-" });
      const inventoryPath = path.join(snapshotDir, "homebrew-inventory.txt");

      yield* fs.writeFileString(inventoryPath, body);
      yield* Console.log(ui.muted(`Pushing ${config.machineId}/${HOMEBREW_INVENTORY_KIND}…`));
      yield* pushLockfile({
        machine: config.machineId,
        kind: HOMEBREW_INVENTORY_KIND,
        path: inventoryPath,
      });
      yield* Console.log(ui.success("Homebrew inventory stored."));
    }),
  );
