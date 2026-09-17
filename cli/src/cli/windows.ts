import { Command } from "effect/unstable/cli";

import { makeWindowsDiffCommand } from "@/commands/diff";
import { fontsCommand } from "@/commands/fonts";
import { lockfilesCommand } from "@/commands/lockfiles";
import { provisionCommand } from "@/commands/provision";
import { windowsInitCommand } from "@/commands/setup/windows";
import { makeWindowsUpdateCommand } from "@/commands/update/windows";
import { makeUpgradeCommand } from "@/commands/upgrade";
import { windowsConfigCommand } from "@/commands/windows-config";
import { windowsPackageCommands } from "@/commands/windows-packages";
import { windowsSetupCommand } from "@/commands/windows-setup";
import { windowsSyncCommand } from "@/commands/windows-sync";

/** Windows root command surface. */
export const makeWindowsRootCommand = (currentVersion: string) =>
  Command.make("outfitting-manager").pipe(
    Command.withDescription("Portable maintenance tools for Outfitting-managed machines."),
    Command.withSubcommands([
      windowsConfigCommand,
      windowsInitCommand,
      windowsSetupCommand,
      makeWindowsUpdateCommand(),
      makeWindowsDiffCommand(),
      windowsSyncCommand,
      ...windowsPackageCommands,
      lockfilesCommand,
      fontsCommand,
      provisionCommand,
      makeUpgradeCommand(currentVersion),
    ]),
  );
