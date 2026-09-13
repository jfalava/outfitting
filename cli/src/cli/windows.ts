import { Command } from "effect/unstable/cli";

import { fontsCommand } from "@/commands/fonts";
import { lockfilesCommand } from "@/commands/lockfiles";
import { provisionCommand } from "@/commands/provision";
import { windowsSetupCommand } from "@/commands/setup/windows";
import { syncCommand } from "@/commands/sync";
import { makeWindowsUpdateCommand } from "@/commands/update/windows";
import { makeUpgradeCommand } from "@/commands/upgrade";

/** Windows root command surface. */
export const makeWindowsRootCommand = (currentVersion: string) =>
  Command.make("outfitting-manager").pipe(
    Command.withDescription("Portable maintenance tools for Outfitting-managed machines."),
    Command.withSubcommands([
      windowsSetupCommand,
      makeWindowsUpdateCommand(),
      syncCommand,
      lockfilesCommand,
      fontsCommand,
      provisionCommand,
      makeUpgradeCommand(currentVersion),
    ]),
  );
