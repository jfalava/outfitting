import { Command, Flag } from "effect/unstable/cli";

import { linuxProfileFlag, optionalString } from "@/commands/linux-flags";
import { runLinuxInit } from "@/setup/linux";

const machineIdFlag = Flag.String("machine-id").pipe(
  Flag.optional,
  Flag.withDescription("Override machine id (default: auto user:arch-os)."),
);

const repoFlag = Flag.String("repo").pipe(
  Flag.optional,
  Flag.withDescription("Local source path override for this invocation."),
);

const noRefreshFlag = Flag.Boolean("no-refresh").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Use the previously validated source without refreshing it."),
);

/** Prepare Linux state and source without applying packages or Home Manager. */
export const linuxInitCommand = Command.make(
  "init",
  {
    profile: linuxProfileFlag,
    machineId: machineIdFlag,
    repo: repoFlag,
    noRefresh: noRefreshFlag,
  },
  ({ profile, machineId, repo, noRefresh }) => {
    const repoPath = optionalString(repo);
    return runLinuxInit({
      profile: optionalString(profile),
      machineId: optionalString(machineId),
      repo: repoPath,
      refreshSource: !noRefresh,
    });
  },
).pipe(
  Command.withDescription(
    "Prepare Linux state and validate the selected source without changing the system.",
  ),
);
