import { Console, Effect } from "effect";

import { sha256Hex } from "@/fonts/archive";
import { printInventoryFaces } from "@/fonts/display";
import {
  inventoriesEqual,
  inventoryFromFaces,
  pullInventory,
  pushInventory,
  type InventorySnapshot,
  type PrivateFontsInventory,
} from "@/fonts/inventory";
import { createR2ObjectStore, loadRemoteArchiveState, type RemoteArchiveState } from "@/fonts/r2";
import { tryPromise } from "@/lockfiles/effect";
import { ui } from "@/ui";

export interface RepopulateResult {
  readonly inventory: PrivateFontsInventory;
  readonly wrote: boolean;
}

export function repopulateInventory(dryRun: boolean) {
  return Effect.gen(function* () {
    const store = yield* tryPromise(() => createR2ObjectStore());
    const remote = yield* tryPromise(() => loadRemoteArchiveState(store));
    return yield* syncInventoryFromRemote(remote, dryRun);
  });
}

export function syncInventoryFromRemote(remote: RemoteArchiveState, dryRun: boolean) {
  return Effect.gen(function* () {
    const snapshot = yield* tryPromise(() => pullInventory());
    const result = yield* tryPromise(() => writeRepopulatedInventory(remote, snapshot, dryRun));
    yield* printRepopulateResult(result, dryRun);
    return result;
  });
}

async function writeRepopulatedInventory(
  remote: RemoteArchiveState,
  snapshot: InventorySnapshot | undefined,
  dryRun: boolean,
): Promise<RepopulateResult> {
  if (remote.bytes === undefined || remote.bytes.byteLength === 0) {
    throw new Error("No private font archive is stored in R2.");
  }
  const inventory = inventoryFromFaces(
    remote.archive.faces,
    sha256Hex(remote.bytes),
    remote.bytes.byteLength,
  );
  if (snapshot !== undefined && inventoriesEqual(snapshot.inventory, inventory)) {
    return { inventory, wrote: false };
  }
  if (!dryRun) {
    await pushInventory(inventory, snapshot?.hash);
  }
  return { inventory, wrote: true };
}

function printRepopulateResult(result: RepopulateResult, dryRun: boolean) {
  return Effect.gen(function* () {
    yield* Console.log(
      ui.muted(
        `${result.inventory.archive.key}  ${result.inventory.archive.sha256}  (${result.inventory.archive.size} bytes)`,
      ),
    );
    yield* printInventoryFaces(result.inventory.faces);
    if (!result.wrote) {
      yield* Console.log(ui.muted("Inventory already matches the R2 archive."));
      return;
    }
    yield* Console.log(
      dryRun
        ? ui.muted("Dry run: skipped rewriting the lockfiles inventory.")
        : ui.success(
            `Repopulated ${ui.key(`${result.inventory.faces.length} faces`)} ${ui.hash(result.inventory.archive.sha256)}`,
          ),
    );
  });
}
