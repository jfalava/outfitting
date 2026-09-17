export {
  foreignPackageManagerMessage,
  foreignPackageManagers,
  MACOS_UPDATE_MANAGERS,
  NIX_ACTIONS,
  PACKAGE_MANAGER_PLATFORM,
  platformLabel,
  type HostPlatform,
  type MacosUpdateManager,
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
