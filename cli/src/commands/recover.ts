import { Command } from "effect/unstable/cli";

import { recoverNix } from "@/update/nix";

const nixRecoveryCommand = Command.make("nix", {}, () => recoverNix()).pipe(
  Command.withDescription("Resume and publish an interrupted nix-darwin update."),
);

/** macOS recovery actions, grouped by package origin. */
export const recoverCommand = Command.make("recover").pipe(
  Command.withDescription("Resume interrupted package-manager operations."),
  Command.withSubcommands([nixRecoveryCommand]),
);
