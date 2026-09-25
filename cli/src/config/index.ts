export { autoMachineId, defaultUsername, hostSystemTriple } from "@/config/machine-id";
export { ensureStateRoot, loadConfig, resolveLinuxConfig } from "@/config/load";
export { normalizeGitRepository, validateGitRef } from "@/config/git";
export { configuredProfile } from "@/config/profile";
export { configFilePath, defaultStateRoot, sparseSourceRoot, stateRoot } from "@/config/paths";
export {
  physicalPath,
  resolveOutfittingRepo,
  tryResolveOutfittingRepo,
  validateOutfittingRepo,
  type OutfittingRepo,
} from "@/config/repo";
export {
  type ConfiguredSource,
  type LinuxConfig,
  type MacosConfig,
  type ManagerConfig,
  type ManagerConfigFile,
  type WindowsConfig,
} from "@/config/types";
