import { Command, Flag } from "effect/unstable/cli";

import { updateBrew } from "@/update/brew";

/** Upgrade installed Homebrew packages. */
export const makeMacosUpdateCommand = () =>
  Command.make(
    "update",
    {
      noPush: Flag.Boolean("no-push").pipe(
        Flag.withDefault(false),
        Flag.withDescription("Skip pushing the observed Homebrew inventory."),
      ),
    },
    ({ noPush }) => updateBrew({ noPush }),
  ).pipe(Command.withDescription("Upgrade installed Homebrew packages."));
