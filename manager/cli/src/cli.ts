import { Command } from "effect/unstable/cli";

import { lockfilesCommand } from "@/commands/lockfiles";

export const rootCommand = Command.make("outfitting-manager").pipe(
  Command.withDescription("Portable maintenance tools for Outfitting-managed machines."),
  Command.withSubcommands([lockfilesCommand]),
);
