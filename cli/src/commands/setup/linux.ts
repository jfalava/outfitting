import { Command, Flag } from "effect/unstable/cli";

import {
  linuxPackageManagerFlag,
  linuxProfileFlag,
  optionalString,
  requestedLinuxPackageManager,
  requireLinuxProfile,
} from "@/commands/linux-flags";
import { runLinuxInit, runLinuxSetup } from "@/setup/linux";

const machineIdFlag = Flag.String("machine-id").pipe(
  Flag.optional,
  Flag.withDescription("Override machine id (default: auto user:arch-os)."),
);

const repoFlag = Flag.String("repo").pipe(
  Flag.optional,
  Flag.withDescription("Local BYOR checkout; takes precedence over the remote BYOR map."),
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
      profile: requireLinuxProfile(profile),
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

/** Prepare and apply the selected Linux package profile. */
export const linuxSetupCommand = Command.make(
  "setup",
  {
    profile: linuxProfileFlag,
    machineId: machineIdFlag,
    repo: repoFlag,
    noRefresh: noRefreshFlag,
    packageManager: linuxPackageManagerFlag,
  },
  ({ profile, machineId, repo, noRefresh, packageManager }) => {
    const repoPath = optionalString(repo);
    return runLinuxSetup({
      profile: requireLinuxProfile(profile),
      machineId: optionalString(machineId),
      repo: repoPath,
      refreshSource: !noRefresh,
      packageManager: requestedLinuxPackageManager(packageManager),
    });
  },
).pipe(
  Command.withDescription(
    "Prepare and apply the selected Linux package profile with apt or pacman.",
  ),
);
