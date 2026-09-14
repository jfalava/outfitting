import { Command } from "effect/unstable/cli";

import { pushHomebrewInventory } from "@/update/snapshot";

const brewSnapshotCommand = Command.make("brew", {}, () => pushHomebrewInventory()).pipe(
  Command.withDescription("Capture and push the observed Homebrew inventory."),
);

/** macOS observed-state snapshots, grouped by package origin. */
export const snapshotCommand = Command.make("snapshot").pipe(
  Command.withDescription("Capture and store observed package state."),
  Command.withSubcommands([brewSnapshotCommand]),
);
