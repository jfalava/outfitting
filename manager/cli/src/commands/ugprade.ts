import { Command } from "effect/unstable/cli";

import { ugprade } from "@/upgrade";

export const makeUgpradeCommand = (currentVersion: string) =>
  Command.make("ugprade", {}, () => ugprade(currentVersion)).pipe(
    Command.withDescription("Check for and install the latest outfitting-manager release."),
  );
