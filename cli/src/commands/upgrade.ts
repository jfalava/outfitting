import { Command } from "effect/unstable/cli";

import { upgrade } from "@/upgrade";

export const makeUpgradeCommand = (currentVersion: string) =>
  Command.make("upgrade", {}, () => upgrade(currentVersion)).pipe(
    Command.withDescription("Check for and install the latest outfitting-manager release."),
  );
