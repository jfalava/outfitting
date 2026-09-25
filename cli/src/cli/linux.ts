import { Command } from "effect/unstable/cli";

import { makeLinuxApplyCommand } from "@/commands/apply/linux";
import { configCommand } from "@/commands/config";
import { makeLinuxDiffCommand } from "@/commands/diff";
import { fontsCommand } from "@/commands/fonts";
import { makeNixCommand } from "@/commands/nix";
import { provisionCommand } from "@/commands/provision";
import { makeSelfUpdateCommand } from "@/commands/self-update";
import { linuxInitCommand } from "@/commands/setup/linux";
import { sourceCommand } from "@/commands/source";
import { makeStatusCommand } from "@/commands/status";
import { syncCommand } from "@/commands/sync";
import { makeLinuxUpdateCommand } from "@/commands/update/linux";
import { validateCommand } from "@/commands/validate";

/** Linux root command surface, including the explicit Ubuntu WSL profile. */
export const makeLinuxRootCommand = (currentVersion: string) =>
  Command.make("outfitting-manager").pipe(
    Command.withDescription("Portable maintenance tools for Outfitting-managed machines."),
    Command.withSubcommands([
      linuxInitCommand,
      configCommand,
      sourceCommand,
      validateCommand,
      makeNixCommand("linux"),
      makeLinuxUpdateCommand(),
      makeLinuxDiffCommand(),
      makeLinuxApplyCommand(),
      syncCommand,
      makeStatusCommand("linux"),
      fontsCommand,
      provisionCommand,
      makeSelfUpdateCommand(currentVersion),
    ]),
  );
