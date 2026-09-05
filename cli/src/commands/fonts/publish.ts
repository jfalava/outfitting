import { Effect } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { collectIncomingFonts, planPublish } from "@/fonts/plan";
import { applyFontPlan } from "@/fonts/publish";
import { createR2ObjectStore, loadRemoteArchive } from "@/fonts/r2";
import { tryPromise } from "@/lockfiles/effect";

export const publishCommand = Command.make(
  "publish",
  {
    directory: Argument.directory("dir", { mustExist: true }).pipe(
      Argument.withDescription("Directory of OpenType fonts to merge into the remote archive."),
    ),
    dryRun: Flag.boolean("dry-run").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Print the planned face table without writing R2 or lockfiles."),
    ),
    yes: Flag.boolean("yes").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip the confirmation prompt."),
    ),
    replace: Flag.boolean("replace").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Allow overwriting an existing archive path."),
    ),
    keepNames: Flag.boolean("keep-names").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Sanitize source filenames instead of OpenType family/style paths."),
    ),
    allowSystemNames: Flag.boolean("allow-system-names").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Allow reserved system families such as Helvetica or Arial."),
    ),
  },
  ({ directory, dryRun, yes, replace, keepNames, allowSystemNames }) =>
    Effect.gen(function* () {
      const incoming = yield* tryPromise(() => collectIncomingFonts(directory));
      const store = yield* tryPromise(() => createR2ObjectStore());
      const archive = yield* tryPromise(() => loadRemoteArchive(store));
      const plan = planPublish(archive, incoming, { replace, keepNames, allowSystemNames });
      yield* applyFontPlan(plan, dryRun, yes, store);
    }),
).pipe(Command.withDescription("Merge local OpenType fonts into the private R2 archive."));
