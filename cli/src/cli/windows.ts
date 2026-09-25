import { Command } from "effect/unstable/cli";

import { configCommand } from "@/commands/config";
import { makeWindowsDiffCommand } from "@/commands/diff";
import { fontsCommand } from "@/commands/fonts";
import { provisionCommand } from "@/commands/provision";
import { windowsInitCommand } from "@/commands/setup/windows";
import { sourceCommand } from "@/commands/source";
import { makeStatusCommand } from "@/commands/status";
import { syncCommand } from "@/commands/sync";
import { makeWindowsUpdateCommand } from "@/commands/update/windows";
import { makeUpgradeCommand } from "@/commands/upgrade";
import { validateCommand } from "@/commands/validate";
import { windowsApplyCommand } from "@/commands/windows-apply";
import { windowsPackageCommands } from "@/commands/windows-packages";
import { windowsSetupCommand } from "@/commands/windows-setup";

/** Windows root command surface. */
export const makeWindowsRootCommand = (currentVersion: string) =>
  Command.make("outfitting-manager").pipe(
    Command.withDescription("Portable maintenance tools for Outfitting-managed machines."),
    Command.withSubcommands([
      windowsInitCommand,
      configCommand,
      sourceCommand,
      windowsSetupCommand,
      validateCommand,
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
