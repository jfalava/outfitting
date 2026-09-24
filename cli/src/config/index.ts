export { autoMachineId, defaultUsername, hostSystemTriple } from "@/config/machine-id";
export { ensureStateRoot, loadConfig, resolveLinuxConfig, saveConfigFile } from "@/config/load";
export {
  byorMapPath,
  configFilePath,
  defaultStateRoot,
  repoPathFile,
  sparseSourceRoot,
  stateRoot,
} from "@/config/paths";
export {
  physicalPath,
  readRepoPathFile,
  resolveOutfittingRepo,
  tryResolveOutfittingRepo,
  validateOutfittingRepo,
  writeRepoPath,
  type OutfittingRepo,
} from "@/config/repo";
export { type LinuxConfig, type ManagerConfig, type ManagerConfigFile } from "@/config/types";
