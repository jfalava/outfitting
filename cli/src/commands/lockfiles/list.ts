import { Command } from "effect/unstable/cli";

import { machineArgument } from "@/commands/lockfiles/arguments";
import { listLockfiles } from "@/lockfiles";

export const listCommand = Command.make("list", { machine: machineArgument }, ({ machine }) =>
  listLockfiles(machine),
).pipe(Command.withDescription("List the lockfile kinds tracked for a machine."));
