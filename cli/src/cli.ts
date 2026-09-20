import { Command } from "effect/unstable/cli";

import { makeMacosDiffCommand } from "@/commands/diff";
import { fontsCommand } from "@/commands/fonts";
import { provisionCommand } from "@/commands/provision";
import { recoverCommand } from "@/commands/recover";
import { setupCommand } from "@/commands/setup";
import { macosInitCommand } from "@/commands/setup/macos";
import { snapshotCommand } from "@/commands/snapshot";
import { makeStatusCommand } from "@/commands/status";
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
      macosInitCommand,
      setupCommand,
      makeMacosUpdateCommand(),
      makeMacosDiffCommand(),
      snapshotCommand,
      recoverCommand,
      syncCommand,
      makeStatusCommand("macos"),
      fontsCommand,
      provisionCommand,
      makeUpgradeCommand(currentVersion),
    ]),
  );

/** @deprecated Prefer makeMacosRootCommand; kept as the default until multi-entry is universal. */
export const makeRootCommand = makeMacosRootCommand;
