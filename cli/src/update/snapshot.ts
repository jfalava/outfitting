import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Console, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand } from "@/process";
import { ui } from "@/ui";

export const HOMEBREW_INVENTORY_KIND = "homebrew-inventory";
export const HOMEBREW_INVENTORY_HEADER = "outfitting-homebrew-inventory-v1";

export async function captureHomebrewInventory(
  run: typeof runCommand = runCommand,
): Promise<string> {
  const [taps, formulae, casks] = await Promise.all([
    run("brew", ["tap"], { inherit: false }),
    run("brew", ["list", "--formula", "--versions"], { inherit: false }),
    run("brew", ["list", "--cask", "--versions"], { inherit: false }),
  ]);

  for (const result of [taps, formulae, casks]) {
    if (result.code !== 0) {
      throw new Error(
        `Failed to capture Homebrew inventory (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
      );
    }
  }

  const sortLines = (text: string): string =>
    text
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .sort((a, b) => a.localeCompare(b, "en"))
      .join("\n");

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
}

export interface PushHomebrewInventoryOptions {
  config?: ManagerConfig;
  run?: typeof runCommand;
}

/** Gather versioned Homebrew inventory and push via lockfiles Worker. */
export const pushHomebrewInventory = (options: PushHomebrewInventoryOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));

    yield* Console.log(ui.heading("Capturing Homebrew inventory…"));
    const body = yield* tryPromise(() => captureHomebrewInventory(run));

    const snapshotDir = yield* tryPromise(() =>
      mkdtemp(join(tmpdir(), "outfitting-snapshot-")),
    );
    const inventoryPath = join(snapshotDir, "homebrew-inventory.txt");

    try {
      yield* tryPromise(() => writeFile(inventoryPath, body, "utf8"));
      yield* Console.log(ui.muted(`Pushing ${config.machineId}/${HOMEBREW_INVENTORY_KIND}…`));
      yield* pushLockfile({
        machine: config.machineId,
        kind: HOMEBREW_INVENTORY_KIND,
        path: inventoryPath,
      });
      yield* Console.log(ui.success("Homebrew inventory stored."));
    } finally {
      yield* tryPromise(async () => {
        await rm(inventoryPath, { force: true });
        await rm(snapshotDir, { force: true, recursive: true });
      });
    }
  });
