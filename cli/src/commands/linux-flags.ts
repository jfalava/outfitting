import { Option } from "effect";
import { Flag } from "effect/unstable/cli";

import { type LinuxPackageManager } from "@/platform/linux";
import { isLinuxProfile, type LinuxProfile } from "@/update/linux";

export const linuxProfileFlag = Flag.String("profile").pipe(
  Flag.withDescription("Profile declared by the selected BYOR source."),
);

export const linuxOptionalProfileFlag = Flag.String("profile").pipe(
  Flag.optional,
  Flag.withDescription("BYOR profile; defaults to the profile selected during init."),
);

export const linuxPackageManagerFlag = Flag.String("package-manager").pipe(
  Flag.optional,
  Flag.withDescription("Override distro detection with apt or pacman."),
);

export const linuxOfflineFlag = Flag.Boolean("offline").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Use the cached Linux package manifest without a network request."),
);

export function optionalString(value: Option.Option<string>): string | undefined {
  return Option.getOrUndefined(value);
}

export function requestedLinuxPackageManager(
  value: Option.Option<string>,
): LinuxPackageManager | undefined {
  const manager = optionalString(value);
  if (manager === undefined) {
    return undefined;
  }
  if (manager !== "apt" && manager !== "pacman") {
    throw new Error(`Unknown Linux package manager \`${manager}\`. Choose: apt or pacman.`);
  }
  return manager;
}

export function requireLinuxProfile(profile: string): LinuxProfile {
  if (!isLinuxProfile(profile)) {
    throw new Error(
      `Invalid Linux profile \`${profile}\`. Use letters, numbers, ., _, and - only.`,
    );
  }
  return profile;
}
