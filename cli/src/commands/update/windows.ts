import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { CliFailure } from "@/errors";
import { updateScoop } from "@/update/scoop";
import { updateWinget } from "@/update/winget";

const packageManagerFlag = Flag.String("package-manager").pipe(
  Flag.withDescription("Installed package manager to upgrade: winget or scoop."),
);

const noPushFlag = Flag.Boolean("no-push").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Write local update state without uploading windows.lock.json."),
);

/** Upgrade installed packages through exactly one selected Windows manager. */
export const makeWindowsUpdateCommand = () =>
  Command.make(
    "update",
    { packageManager: packageManagerFlag, noPush: noPushFlag },
    ({ packageManager, noPush }) => {
      if (packageManager === "winget") {
        return updateWinget({ noPush });
      }
      if (packageManager === "scoop") {
        return updateScoop({ noPush });
      }
      return Effect.fail(
        new CliFailure({
          message: `Unknown Windows package manager \`${packageManager}\`. Choose: winget or scoop.`,
        }),
      );
    },
  ).pipe(
    Command.withDescription(
      "Upgrade installed packages through one manager: --package-manager winget|scoop.",
    ),
  );
