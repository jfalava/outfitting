import { Command } from "effect/unstable/cli";

import { historyLockfiles } from "../../lockfiles";

import { kindArgument, machineArgument } from "./arguments";

export const historyCommand = Command.make(
  "history",
  { machine: machineArgument, kind: kindArgument },
  ({ machine, kind }) => historyLockfiles(machine, kind),
).pipe(Command.withDescription("Show version history for a machine and kind."));
