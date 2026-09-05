import { Console, Effect } from "effect";

import { checksumSidecar, packFontArchive, sha256Hex } from "@/fonts/archive";
import { confirmPlan, printFaceTable } from "@/fonts/display";
import { inventoryFromFaces, pullInventory, pushInventory } from "@/fonts/inventory";
import type { FontPlan } from "@/fonts/plan";
import type { FontObjectStore } from "@/fonts/r2";
import { tryPromise } from "@/lockfiles/effect";
import { ui } from "@/ui";

export function applyFontPlan(
  plan: FontPlan,
  dryRun: boolean,
  yes: boolean,
  store: FontObjectStore,
) {
  return Effect.gen(function* () {
    yield* printFaceTable(plan.faces);
    if (dryRun) {
      yield* Console.log(ui.muted("Dry run: skipped R2 upload and lockfile inventory."));
      return;
    }

    const confirmed = yield* confirmPlan(yes, "Upload the packed archive and rewrite inventory?");
    if (!confirmed) {
      yield* Console.log(ui.muted("Aborted."));
      return;
    }

    const packed = yield* tryPromise(() => packFontArchive(plan.files));
    const checksum = checksumSidecar(packed);
    const snapshot = yield* tryPromise(() => pullInventory());
    yield* tryPromise(() => store.putArchive(packed, checksum));

    const kept = plan.faces.filter((face) => face.change !== "removed");
    const inventory = inventoryFromFaces(kept, sha256Hex(packed), packed.byteLength);
    yield* tryPromise(() => pushInventory(inventory, snapshot?.hash));
    yield* Console.log(
      ui.success(
        `Published ${ui.key(`${kept.length} faces`)} ${ui.hash(inventory.archive.sha256)} ${ui.muted(`(${inventory.archive.size} bytes)`)}`,
      ),
    );
  });
}
