/** Linux profile names are declared by the selected BYOR source. */
export type LinuxProfile = string & {};

const LINUX_PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** True when `value` is a syntactically valid repository profile name. */
export function isLinuxProfile(value: string): value is LinuxProfile {
  return LINUX_PROFILE_NAME.test(value);
}
