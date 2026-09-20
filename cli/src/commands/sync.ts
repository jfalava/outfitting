import { Command } from "effect/unstable/cli";

import { configureTokenCommand, configureWorkerCommand } from "@/commands/lockfiles/configure";
import { historyCommand } from "@/commands/lockfiles/history";
import { listCommand } from "@/commands/lockfiles/list";
import { pullCommand } from "@/commands/lockfiles/pull";
import { pushCommand } from "@/commands/lockfiles/push";

export const syncSubcommands = [
  configureWorkerCommand,
  configureTokenCommand,
  pushCommand,
  pullCommand,
  listCommand,
  historyCommand,
] as const;

/** Remote inventory/lock transport, identical on every platform. */
export const syncCommand = Command.make("sync").pipe(
  Command.withDescription(
    "Push, pull, and inspect remote lock snapshots without changing installed packages.",
  ),
  Command.withSubcommands([...syncSubcommands]),
);
