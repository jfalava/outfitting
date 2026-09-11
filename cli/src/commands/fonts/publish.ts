import { Effect } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { collectIncomingFonts, planPublish } from "@/fonts/plan";
import { applyFontPlan } from "@/fonts/publish";
import { syncInventoryFromRemote } from "@/fonts/repopulate";
import { createR2ObjectStore, loadRemoteArchiveState } from "@/fonts/r2";
import { tryPromise } from "@/lockfiles/effect";

export const publishCommand = Command.make(
  "publish",
  {
    directory: Argument.Directory("dir", { mustExist: true }).pipe(
      Argument.withDescription("Directory of OpenType fonts to merge into the remote archive."),
    ),
    dryRun: Flag.Boolean("dry-run").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Print the planned face table without writing R2 or lockfiles."),
    ),
    yes: Flag.Boolean("yes").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip the confirmation prompt."),
    ),
    replace: Flag.Boolean("replace").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Allow overwriting an existing archive path."),
    ),
    keepNames: Flag.Boolean("keep-names").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Sanitize source filenames instead of OpenType family/style paths."),
    ),
    allowSystemNames: Flag.Boolean("allow-system-names").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Allow reserved system families such as Helvetica or Arial."),
    ),
    repopulate: Flag.Boolean("repopulate").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Rebuild the lockfiles inventory from the live R2 archive first."),
    ),
  },
  ({ directory, dryRun, yes, replace, keepNames, allowSystemNames, repopulate }) =>
    Effect.gen(function* () {
      const incoming = yield* tryPromise(() => collectIncomingFonts(directory));
      const store = yield* tryPromise(() => createR2ObjectStore());
      const remote = yield* tryPromise(() => loadRemoteArchiveState(store));
      if (repopulate) {
        yield* syncInventoryFromRemote(remote, dryRun);
      }
      const plan = planPublish(remote.archive, incoming, { replace, keepNames, allowSystemNames });
      yield* applyFontPlan(plan, dryRun, yes, store);
    }),
).pipe(Command.withDescription("Merge local OpenType fonts into the private R2 archive."));
