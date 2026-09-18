import { Command } from "effect/unstable/cli";

import { makeLinuxDiffCommand } from "@/commands/diff";
import { fontsCommand } from "@/commands/fonts";
import { lockfilesCommand } from "@/commands/lockfiles";
import { provisionCommand } from "@/commands/provision";
import { linuxSetupCommand } from "@/commands/setup/linux";
import { makeLinuxSyncCommand } from "@/commands/sync/linux";
import { makeLinuxUpdateCommand } from "@/commands/update/linux";
import { makeUpgradeCommand } from "@/commands/upgrade";

/** Generic Linux root command surface; WSL shell helpers remain separate. */
export const makeLinuxRootCommand = (currentVersion: string) =>
  Command.make("outfitting-manager").pipe(
    Command.withDescription("Portable maintenance tools for Outfitting-managed machines."),
    Command.withSubcommands([
      linuxSetupCommand,
      makeLinuxUpdateCommand(),
      makeLinuxDiffCommand(),
      makeLinuxSyncCommand(),
      lockfilesCommand,
      fontsCommand,
      provisionCommand,
      makeUpgradeCommand(currentVersion),
    ]),
  );
