export {
  foreignPackageManagerMessage,
  foreignPackageManagers,
  NIX_ACTIONS,
  PACKAGE_MANAGER_PLATFORM,
  platformLabel,
  type HostPlatform,
  type NixAction,
  type PackageManager,
} from "@/platform/availability";
export {
  detectLinuxPackageManager,
  linuxDistributionFamily,
  parseOsRelease,
  type DetectLinuxPackageManagerOptions,
  type LinuxDistributionFamily,
  type LinuxPackageManager,
} from "@/platform/linux";
