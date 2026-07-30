import { Command } from "effect/unstable/cli";

import { listLockfiles } from "../../lockfiles";

import { machineArgument } from "./arguments";

export const listCommand = Command.make("list", { machine: machineArgument }, ({ machine }) =>
  listLockfiles(machine),
).pipe(Command.withDescription("List the lockfile kinds tracked for a machine."));
