import { Command } from "effect/unstable/cli";

import { upgrade } from "@/upgrade";

export const makeSelfUpdateCommand = (currentVersion: string) =>
  Command.make("self-update", {}, () => upgrade(currentVersion)).pipe(
    Command.withDescription("Check for and install the latest outfitting-manager release."),
  );
