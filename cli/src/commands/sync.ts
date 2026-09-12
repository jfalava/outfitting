import { Command } from "effect/unstable/cli";

import { configureTokenCommand, configureWorkerCommand } from "@/commands/lockfiles/configure";
import { historyCommand } from "@/commands/lockfiles/history";
import { listCommand } from "@/commands/lockfiles/list";
import { pullCommand } from "@/commands/lockfiles/pull";
import { pushCommand } from "@/commands/lockfiles/push";

const syncSubcommands = [
  configureWorkerCommand,
  configureTokenCommand,
  pushCommand,
  pullCommand,
  listCommand,
  historyCommand,
] as const;

/**
 * Primary UX name for remote inventory/lock I/O.
 * Same subcommands and storage as `lockfiles` (alias kept during migration).
 */
export const syncCommand = Command.make("sync").pipe(
  Command.withDescription(
    "Push, pull, and inspect remote inventory/lock snapshots (lockfiles Worker). Primary name; `lockfiles` remains an alias.",
  ),
  Command.withSubcommands([...syncSubcommands]),
);
