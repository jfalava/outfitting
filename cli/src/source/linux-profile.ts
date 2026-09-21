/** Built-in Linux profiles shipped with Outfitting. */
export const LINUX_PROFILES = ["generic-linux", "oci-agents", "ubuntu-wsl"] as const;

export type BuiltInLinuxProfile = (typeof LINUX_PROFILES)[number];

/**
 * Any Linux profile name: a built-in or a repository-owned (BYOR) profile.
 * Prefer {@link isLinuxProfile} / {@link isBuiltInLinuxProfile} at boundaries.
 */
export type LinuxProfile = BuiltInLinuxProfile | (string & {});

const LINUX_PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** True when `value` is a built-in profile with a sparse-source closure. */
export function isBuiltInLinuxProfile(value: string): value is BuiltInLinuxProfile {
  return (LINUX_PROFILES as ReadonlyArray<string>).includes(value);
}

/** True when `value` is a syntactically valid built-in or BYOR profile name. */
export function isLinuxProfile(value: string): value is LinuxProfile {
  return LINUX_PROFILE_NAME.test(value);
}
