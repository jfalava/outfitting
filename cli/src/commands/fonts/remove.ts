import { Effect } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { planRemove } from "@/fonts/plan";
import { applyFontPlan } from "@/fonts/publish";
import { syncInventoryFromRemote } from "@/fonts/repopulate";
import { createR2ObjectStore, loadRemoteArchiveState } from "@/fonts/r2";
import { tryPromise } from "@/lockfiles/effect";

export const removeCommand = Command.make(
  "remove",
  {
    names: Argument.string("name").pipe(
      Argument.variadic({ min: 1 }),
      Argument.withDescription("Family slug, archive path, or PostScript name to drop."),
    ),
    family: Flag.boolean("family").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Treat each argument as a whole family to remove."),
    ),
    dryRun: Flag.boolean("dry-run").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Print the planned face table without writing R2 or lockfiles."),
    ),
    yes: Flag.boolean("yes").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip the confirmation prompt."),
    ),
    repopulate: Flag.boolean("repopulate").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Rebuild the lockfiles inventory from the live R2 archive first."),
    ),
  },
  ({ names, family, dryRun, yes, repopulate }) =>
    Effect.gen(function* () {
      const store = yield* tryPromise(() => createR2ObjectStore());
      const remote = yield* tryPromise(() => loadRemoteArchiveState(store));
      if (repopulate) {
        yield* syncInventoryFromRemote(remote, dryRun);
      }
      const plan = planRemove(remote.archive, names, family);
      yield* applyFontPlan(plan, dryRun, yes, store);
    }),
).pipe(Command.withDescription("Remove faces from the private R2 font archive."));
