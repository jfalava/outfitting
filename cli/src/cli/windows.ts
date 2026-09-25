import { Command } from "effect/unstable/cli";

import { configCommand } from "@/commands/config";
import { makeWindowsDiffCommand } from "@/commands/diff";
import { fontsCommand } from "@/commands/fonts";
import { provisionCommand } from "@/commands/provision";
import { makeSelfUpdateCommand } from "@/commands/self-update";
import { windowsInitCommand } from "@/commands/setup/windows";
import { sourceCommand } from "@/commands/source";
import { makeStatusCommand } from "@/commands/status";
import { syncCommand } from "@/commands/sync";
import { makeWindowsUpdateCommand } from "@/commands/update/windows";
import { validateCommand } from "@/commands/validate";
import { windowsApplyCommand } from "@/commands/windows-apply";
import { windowsPackageCommands } from "@/commands/windows-packages";

/** Windows root command surface. */
export const makeWindowsRootCommand = (currentVersion: string) =>
  Command.make("outfitting-manager").pipe(
    Command.withDescription("Portable maintenance tools for Outfitting-managed machines."),
    Command.withSubcommands([
      windowsInitCommand,
      configCommand,
      sourceCommand,
      validateCommand,
      makeWindowsUpdateCommand(),
      makeWindowsDiffCommand(),
      windowsApplyCommand,
      ...windowsPackageCommands,
      syncCommand,
      makeStatusCommand("windows"),
      fontsCommand,
      provisionCommand,
      makeSelfUpdateCommand(currentVersion),
    ]),
  );
