import { Command } from "effect/unstable/cli";

import { macosApplyCommand } from "@/commands/apply/macos";
import { configCommand } from "@/commands/config";
import { makeMacosDiffCommand } from "@/commands/diff";
import { fontsCommand } from "@/commands/fonts";
import { makeNixCommand } from "@/commands/nix";
import { provisionCommand } from "@/commands/provision";
import { recoverCommand } from "@/commands/recover";
import { makeSelfUpdateCommand } from "@/commands/self-update";
import { macosInitCommand } from "@/commands/setup/macos";
import { snapshotCommand } from "@/commands/snapshot";
import { sourceCommand } from "@/commands/source";
import { makeStatusCommand } from "@/commands/status";
import { syncCommand } from "@/commands/sync";
import { makeMacosUpdateCommand } from "@/commands/update";
import { validateCommand } from "@/commands/validate";

/**
 * macOS root command surface.
 * The Windows entrypoint registers its own platform-specific command tree.
 */
export const makeMacosRootCommand = (currentVersion: string) =>
  Command.make("outfitting-manager").pipe(
    Command.withDescription("Portable maintenance tools for Outfitting-managed machines."),
    Command.withSubcommands([
      macosInitCommand,
      macosApplyCommand,
      configCommand,
      sourceCommand,
      validateCommand,
      makeNixCommand("macos"),
      makeMacosUpdateCommand(),
      makeMacosDiffCommand(),
      snapshotCommand,
      recoverCommand,
      syncCommand,
      makeStatusCommand("macos"),
      fontsCommand,
      provisionCommand,
      makeSelfUpdateCommand(currentVersion),
    ]),
  );

/** @deprecated Prefer makeMacosRootCommand; kept as the default until multi-entry is universal. */
export const makeRootCommand = makeMacosRootCommand;
