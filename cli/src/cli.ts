import { Command } from "effect/unstable/cli";

import { fontsCommand } from "@/commands/fonts";
import { lockfilesCommand } from "@/commands/lockfiles";
import { provisionCommand } from "@/commands/provision";
import { setupCommand } from "@/commands/setup";
import { syncCommand } from "@/commands/sync";
import { makeMacosUpdateCommand } from "@/commands/update";
import { makeUpgradeCommand } from "@/commands/upgrade";

/**
 * macOS root command surface.
 * Windows/linux entrypoints will register their own update trees later.
 */
export const makeMacosRootCommand = (currentVersion: string) =>
  Command.make("outfitting-manager").pipe(
    Command.withDescription("Portable maintenance tools for Outfitting-managed machines."),
    Command.withSubcommands([
      setupCommand,
      makeMacosUpdateCommand(),
      syncCommand,
      lockfilesCommand,
      fontsCommand,
      provisionCommand,
      makeUpgradeCommand(currentVersion),
    ]),
  );

/** @deprecated Prefer makeMacosRootCommand; kept as the default until multi-entry is universal. */
export const makeRootCommand = makeMacosRootCommand;
