export {
  updateBun,
  parseBunGlobalList,
  fetchNpmLatestVersion,
  type NpmFetcher,
} from "@/update/bun";
export { updateBrew, parseBrewfileTaps, BREWFILE_MANIFEST_PATH } from "@/update/brew";
export {
  captureHomebrewInventory,
  pushHomebrewInventory,
  HOMEBREW_INVENTORY_HEADER,
  HOMEBREW_INVENTORY_KIND,
} from "@/update/snapshot";
export {
  updateNix,
  buildNixSystem,
  activateNixSystem,
  prepareNixRecovery,
  nextRecoveryAction,
  NIX_SYSTEM_ATTR,
} from "@/update/nix";
