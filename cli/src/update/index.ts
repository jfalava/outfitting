export { updateAll, type UpdateAllOptions, type UpdateStepResult } from "@/update/all";
export { parseBunGlobalList } from "@/update/bun";
export { updateBrew, parseBrewfileTaps, BREWFILE_MANIFEST_PATH } from "@/update/brew";
export {
  isLinuxProfile,
  applyLinux,
  linuxManifestPath,
  linuxPackageManagerArgs,
  LINUX_PROFILES,
  listInstalledLinuxPackages,
  linuxPackageIdentity,
  missingLinuxPackages,
  parseLinuxPackageManifest,
  updateLinux,
  type LinuxPackageAction,
  type LinuxPackageInventoryOptions,
  type LinuxProfile,
  type LinuxApplyOptions,
  type LinuxUpdateOptions,
} from "@/update/linux";
export {
  captureHomebrewInventory,
  pushHomebrewInventory,
  HOMEBREW_INVENTORY_HEADER,
  HOMEBREW_INVENTORY_KIND,
} from "@/update/snapshot";
export {
  updateNix,
  recoverNix,
  buildNixSystem,
  activateNixSystem,
  prepareNixRecovery,
  nextRecoveryAction,
  NIX_SYSTEM_ATTR,
} from "@/update/nix";
export { updateScoop, parseScoopManifest, SCOOP_MANIFEST_PATH } from "@/update/scoop";
export { updateWinget } from "@/update/winget";
export { updateWindowsAll } from "@/update/windows-all";
export {
  captureBunGlobalInventory,
  captureScoopInventory,
  exportWingetInventory,
  pushBunGlobalInventory,
  pushScoopInventory,
  pushWingetInventory,
  BUN_GLOBAL_INVENTORY_FORMAT,
  BUN_GLOBAL_INVENTORY_KIND,
  SCOOP_INVENTORY_FORMAT,
  SCOOP_INVENTORY_KIND,
  WINGET_INVENTORY_KIND,
} from "@/update/windows-snapshot";
