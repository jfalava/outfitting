import { Command, Flag } from "effect/unstable/cli";

import { repopulateInventory } from "@/fonts/repopulate";

export const repopulateCommand = Command.make(
  "repopulate",
  {
    dryRun: Flag.Boolean("dry-run").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Compare R2 to the lockfiles inventory without writing."),
    ),
  },
  ({ dryRun }) => repopulateInventory(dryRun),
).pipe(Command.withDescription("Rebuild the lockfiles inventory from the live R2 font archive."));
