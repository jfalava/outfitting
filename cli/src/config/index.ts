export { autoMachineId, defaultUsername, hostSystemTriple } from "@/config/machine-id";
export { ensureStateRoot, loadConfig, saveConfigFile } from "@/config/load";
export {
  configFilePath,
  defaultStateRoot,
  manifestCacheDir,
  manifestsDir,
  repoPathFile,
  sparseSourceRoot,
  stateRoot,
} from "@/config/paths";
export {
  physicalPath,
  DEFAULT_OUTFITTING_REPO_URL,
  readRepoPathFile,
  resolveOutfittingRepo,
  syncOutfittingRepo,
  tryResolveOutfittingRepo,
  validateOutfittingRepo,
  writeRepoPath,
  type OutfittingRepo,
} from "@/config/repo";
export {
  DEFAULT_MANIFEST_BASE_URL,
  DEFAULT_MANIFEST_REF,
  DEFAULT_WINDOWS_ROUTES,
  type ManagerConfig,
  type ManagerConfigFile,
  type ManifestSourceConfig,
  type WindowsRoutesConfig,
} from "@/config/types";
export { resolveWindowsRoutes } from "@/config/load";
