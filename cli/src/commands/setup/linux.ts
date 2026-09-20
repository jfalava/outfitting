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

const manifestBaseUrlFlag = Flag.String("manifest-base-url").pipe(
  Flag.optional,
  Flag.withDescription("Raw-compatible repository base URL without ref."),
);

const manifestRefFlag = Flag.String("manifest-ref").pipe(
  Flag.optional,
  Flag.withDescription("Git ref for manifests (default: main)."),
);

const repoFlag = Flag.String("repo").pipe(
  Flag.optional,
  Flag.withDescription(
    "Optional full checkout path for a Nix-backed profile; omit to use the sparse source.",
  ),
);

const noFetchFlag = Flag.Boolean("no-fetch").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Use the selected Linux package manifest already in the cache."),
);

/** Prepare Linux state and source without applying packages or Home Manager. */
export const linuxInitCommand = Command.make(
  "init",
  {
    profile: linuxProfileFlag,
    machineId: machineIdFlag,
    manifestBaseUrl: manifestBaseUrlFlag,
    manifestRef: manifestRefFlag,
    repo: repoFlag,
    noFetch: noFetchFlag,
  },
  ({ profile, machineId, manifestBaseUrl, manifestRef, repo, noFetch }) =>
    runLinuxInit({
      profile: requireLinuxProfile(profile),
      machineId: optionalString(machineId),
      manifestBaseUrl: optionalString(manifestBaseUrl),
      manifestRef: optionalString(manifestRef),
      repo: optionalString(repo),
      fetchManifests: !noFetch,
    }),
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
    manifestBaseUrl: manifestBaseUrlFlag,
    manifestRef: manifestRefFlag,
    repo: repoFlag,
    noFetch: noFetchFlag,
    packageManager: linuxPackageManagerFlag,
  },
  ({ profile, machineId, manifestBaseUrl, manifestRef, repo, noFetch, packageManager }) =>
    runLinuxSetup({
      profile: requireLinuxProfile(profile),
      machineId: optionalString(machineId),
      manifestBaseUrl: optionalString(manifestBaseUrl),
      manifestRef: optionalString(manifestRef),
      repo: optionalString(repo),
      fetchManifests: !noFetch,
      packageManager: requestedLinuxPackageManager(packageManager),
    }),
).pipe(
  Command.withDescription(
    "Prepare and apply the selected Linux package profile with apt or pacman.",
  ),
);
