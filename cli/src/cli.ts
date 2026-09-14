import { Command } from "effect/unstable/cli";

import { fontsCommand } from "@/commands/fonts";
import { lockfilesCommand } from "@/commands/lockfiles";
import { provisionCommand } from "@/commands/provision";
import { recoverCommand } from "@/commands/recover";
import { setupCommand } from "@/commands/setup";
import { snapshotCommand } from "@/commands/snapshot";
import { syncCommand } from "@/commands/sync";
import { makeMacosUpdateCommand } from "@/commands/update";
import { makeUpgradeCommand } from "@/commands/upgrade";

/**
 * macOS root command surface.
 * The Windows entrypoint registers its own platform-specific command tree.
 */
export const makeMacosRootCommand = (currentVersion: string) =>
  Command.make("outfitting-manager").pipe(
    Command.withDescription("Portable maintenance tools for Outfitting-managed machines."),
    Command.withSubcommands([
      setupCommand,
      makeMacosUpdateCommand(),
      snapshotCommand,
      recoverCommand,
      syncCommand,
      lockfilesCommand,
      fontsCommand,
      provisionCommand,
      makeUpgradeCommand(currentVersion),
    ]),
  );

/** @deprecated Prefer makeMacosRootCommand; kept as the default until multi-entry is universal. */
export const makeRootCommand = makeMacosRootCommand;
