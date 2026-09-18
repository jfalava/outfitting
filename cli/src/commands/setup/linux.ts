import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { type LinuxPackageManager } from "@/platform/linux";
import { runLinuxInit, runLinuxSetup } from "@/setup/linux";
import { isLinuxProfile, LINUX_PROFILES } from "@/update/linux";

const profileFlag = Flag.String("profile").pipe(
  Flag.withDefault("generic-linux"),
  Flag.withDescription(`Linux package profile (${LINUX_PROFILES.join(", ")}).`),
);

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

const packageManagerFlag = Flag.String("package-manager").pipe(
  Flag.optional,
  Flag.withDescription("Override distro detection with apt or pacman."),
);

function optional(value: Option.Option<string>): string | undefined {
  return Option.getOrUndefined(value);
}

function requestedPackageManager(value: Option.Option<string>): LinuxPackageManager | undefined {
  const manager = optional(value);
  if (manager === undefined) {
    return undefined;
  }
  if (manager !== "apt" && manager !== "pacman") {
    throw new Error(`Unknown Linux package manager \`${manager}\`. Choose: apt or pacman.`);
  }
  return manager;
}

/** Prepare Linux state and, for Nix-backed profiles, apply Home Manager. */
export const linuxInitCommand = Command.make(
  "init",
  {
    profile: profileFlag,
    machineId: machineIdFlag,
    manifestBaseUrl: manifestBaseUrlFlag,
    manifestRef: manifestRefFlag,
    repo: repoFlag,
    noFetch: noFetchFlag,
  },
  ({ profile, machineId, manifestBaseUrl, manifestRef, repo, noFetch }) => {
    if (!isLinuxProfile(profile)) {
      throw new Error(
        `Unknown Linux profile \`${profile}\`. Choose: ${LINUX_PROFILES.join(", ")}.`,
      );
    }
    return runLinuxInit({
      profile,
      machineId: optional(machineId),
      manifestBaseUrl: optional(manifestBaseUrl),
      manifestRef: optional(manifestRef),
      repo: optional(repo),
      fetchManifests: !noFetch,
    });
  },
).pipe(
  Command.withDescription(
    "Prepare Linux state and bootstrap the selected profile's Nix configuration without changing packages.",
  ),
);

/** Prepare and apply the selected Linux package profile. */
export const linuxSetupCommand = Command.make(
  "setup",
  {
    profile: profileFlag,
    machineId: machineIdFlag,
    manifestBaseUrl: manifestBaseUrlFlag,
    manifestRef: manifestRefFlag,
    repo: repoFlag,
    noFetch: noFetchFlag,
    packageManager: packageManagerFlag,
  },
  ({ profile, machineId, manifestBaseUrl, manifestRef, repo, noFetch, packageManager }) => {
    if (!isLinuxProfile(profile)) {
      throw new Error(
        `Unknown Linux profile \`${profile}\`. Choose: ${LINUX_PROFILES.join(", ")}.`,
      );
    }
    return runLinuxSetup({
      profile,
      machineId: optional(machineId),
      manifestBaseUrl: optional(manifestBaseUrl),
      manifestRef: optional(manifestRef),
      repo: optional(repo),
      fetchManifests: !noFetch,
      packageManager: requestedPackageManager(packageManager),
    });
  },
).pipe(
  Command.withDescription(
    "Prepare and apply the selected Linux package profile with apt or pacman.",
  ),
);
