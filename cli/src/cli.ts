import { Command } from "effect/unstable/cli";

import { lockfilesCommand } from "@/commands/lockfiles";
import { makeUpgradeCommand } from "@/commands/upgrade";

export const makeRootCommand = (currentVersion: string) =>
  Command.make("outfitting-manager").pipe(
    Command.withDescription(
      "Portable maintenance tools for Outfitting-managed machines.",
    ),
    Command.withSubcommands([
      lockfilesCommand,
      makeUpgradeCommand(currentVersion),
    ]),
  );
