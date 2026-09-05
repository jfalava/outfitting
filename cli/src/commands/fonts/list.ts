import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { printInventoryFaces } from "@/fonts/display";
import { pullInventory } from "@/fonts/inventory";
import { tryPromise } from "@/lockfiles/effect";
import { ui } from "@/ui";

export const listCommand = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const snapshot = yield* tryPromise(() => pullInventory());
    if (snapshot === undefined) {
      yield* Console.log(ui.muted("No private-fonts inventory is stored yet."));
      return;
    }
    yield* Console.log(
      ui.muted(
        `${snapshot.inventory.archive.key}  ${snapshot.inventory.archive.sha256}  (${snapshot.inventory.archive.size} bytes)`,
      ),
    );
    yield* printInventoryFaces(snapshot.inventory.faces);
  }),
).pipe(Command.withDescription("List private font faces from the lockfiles inventory."));
