import { Command } from "effect/unstable/cli";

import { listLockfiles } from "@/lockfiles";

export const listCommand = Command.make("list", {}, () => listLockfiles()).pipe(
  Command.withDescription("List lockfile kinds tracked for this machine."),
);
