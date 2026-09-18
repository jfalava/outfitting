import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { type LinuxPackageManager } from "@/platform/linux";
import { runLinuxSetup } from "@/setup/linux";
import { runSetup } from "@/setup/run";
import { isLinuxProfile, linuxManifestPath } from "@/update/linux";

const profileFlag = Flag.string("profile").pipe(
  Flag.withDefault("generic-linux"),
  Flag.withDescription("Linux package profile (generic-linux or oci-agents)."),
);

const machineIdFlag = Flag.string("machine-id").pipe(
  Flag.optional,
  Flag.withDescription("Override machine id (default: auto user:arch-os)."),
);

const manifestBaseUrlFlag = Flag.string("manifest-base-url").pipe(
  Flag.optional,
  Flag.withDescription("Raw-compatible repository base URL without ref."),
);

const manifestRefFlag = Flag.string("manifest-ref").pipe(
  Flag.optional,
  Flag.withDescription("Git ref for manifests (default: main)."),
);

const repoFlag = Flag.string("repo").pipe(
  Flag.optional,
  Flag.withDescription("Existing monorepo path to store for the opt-in oci-agents profile."),
);

const noFetchFlag = Flag.boolean("no-fetch").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Use the selected Linux package manifest already in the cache."),
);

const packageManagerFlag = Flag.string("package-manager").pipe(
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

/** Prepare and validate Linux state without changing the package manager. */
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
      throw new Error(`Unknown Linux profile \`${profile}\`. Choose: generic-linux or oci-agents.`);
    }
    return runSetup({
      machineId: optional(machineId),
      manifestBaseUrl: optional(manifestBaseUrl),
      manifestRef: optional(manifestRef),
      repo: optional(repo),
      fetchManifests: !noFetch,
      manifestPaths: [linuxManifestPath(profile)],
      nextCommand: "Next: outfitting-manager setup",
    });
  },
).pipe(
  Command.withDescription(
    "Prepare the Linux state root and cache a package profile without changing installed packages.",
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
      throw new Error(`Unknown Linux profile \`${profile}\`. Choose: generic-linux or oci-agents.`);
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
