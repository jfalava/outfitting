import { Command } from "effect/unstable/cli";

import { kindArgument, machineArgument } from "@/commands/lockfiles/arguments";
import { historyLockfiles } from "@/lockfiles";

export const historyCommand = Command.make(
  "history",
  { machine: machineArgument, kind: kindArgument },
  ({ machine, kind }) => historyLockfiles(machine, kind),
).pipe(Command.withDescription("Show version history for a machine and kind."));
