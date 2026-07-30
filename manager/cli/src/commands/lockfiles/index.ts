import { Command } from "effect/unstable/cli";

import { configureTokenCommand, configureWorkerCommand } from "./configure";
import { historyCommand } from "./history";
import { listCommand } from "./list";
import { pullCommand } from "./pull";
import { pushCommand } from "./push";

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
