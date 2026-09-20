import { Command } from "effect/unstable/cli";

import { makeWindowsDiffCommand } from "@/commands/diff";
import { fontsCommand } from "@/commands/fonts";
import { provisionCommand } from "@/commands/provision";
import { windowsInitCommand } from "@/commands/setup/windows";
import { makeStatusCommand } from "@/commands/status";
import { syncCommand } from "@/commands/sync";
import { makeWindowsUpdateCommand } from "@/commands/update/windows";
import { makeUpgradeCommand } from "@/commands/upgrade";
import { windowsApplyCommand } from "@/commands/windows-apply";
import { windowsConfigCommand } from "@/commands/windows-config";
import { windowsPackageCommands } from "@/commands/windows-packages";
import { windowsSetupCommand } from "@/commands/windows-setup";

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
      windowsApplyCommand,
      ...windowsPackageCommands,
      syncCommand,
      makeStatusCommand("windows"),
      fontsCommand,
      provisionCommand,
      makeUpgradeCommand(currentVersion),
    ]),
  );
