import { Command } from "effect/unstable/cli";

import {
  configureTokenCommand,
  configureWorkerCommand,
} from "@/commands/lockfiles/configure";
import { historyCommand } from "@/commands/lockfiles/history";
import { listCommand } from "@/commands/lockfiles/list";
import { pullCommand } from "@/commands/lockfiles/pull";
import { pushCommand } from "@/commands/lockfiles/push";

export const lockfilesCommand = Command.make("lockfiles").pipe(
  Command.withDescription(
    "Push, pull, and inspect lockfile snapshots stored by the lockfiles Worker.",
  ),
  Command.withSubcommands([
    configureWorkerCommand,
    configureTokenCommand,
    pushCommand,
    pullCommand,
    listCommand,
    historyCommand,
  ]),
);

export const runLockfilesCli = (args: ReadonlyArray<string>) =>
  Command.runWith(lockfilesCommand, { version: "0.1.0" })(args);
