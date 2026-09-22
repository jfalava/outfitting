import { Command } from "effect/unstable/cli";

import { makeLinuxApplyCommand } from "@/commands/apply/linux";
import { byorCommand } from "@/commands/byor";
import { makeLinuxDiffCommand } from "@/commands/diff";
import { fontsCommand } from "@/commands/fonts";
import { provisionCommand } from "@/commands/provision";
import { linuxInitCommand, linuxSetupCommand } from "@/commands/setup/linux";
import { makeStatusCommand } from "@/commands/status";
import { syncCommand } from "@/commands/sync";
import { makeLinuxUpdateCommand } from "@/commands/update/linux";
import { makeUpgradeCommand } from "@/commands/upgrade";
import { validateCommand } from "@/commands/validate";

/** Linux root command surface, including the explicit Ubuntu WSL profile. */
export const makeLinuxRootCommand = (currentVersion: string) =>
  Command.make("outfitting-manager").pipe(
    Command.withDescription("Portable maintenance tools for Outfitting-managed machines."),
    Command.withSubcommands([
      linuxInitCommand,
      linuxSetupCommand,
      byorCommand,
      validateCommand,
      makeLinuxUpdateCommand(),
      makeLinuxDiffCommand(),
      makeLinuxApplyCommand(),
      syncCommand,
      makeStatusCommand("linux"),
      fontsCommand,
      provisionCommand,
      makeUpgradeCommand(currentVersion),
    ]),
  );
