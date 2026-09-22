export {
  GENERIC_LINUX_SOURCE_PATHS,
  LINUX_COMMON_SOURCE_PATHS,
  LINUX_SOURCE_PATHS,
  linuxSourcePaths,
  MACOS_SOURCE_PATHS,
  OCI_AGENTS_SOURCE_PATHS,
  prefetchSetupManifests,
  SETUP_MANIFEST_PATHS,
  UBUNTU_WSL_SOURCE_PATHS,
  WINDOWS_SETUP_MANIFEST_PATHS,
  windowsSetupManifestPaths,
} from "@/setup/manifests";
export { runSetup, type SetupOptions } from "@/setup/run";
export { runLinuxSetup, type LinuxSetupOptions } from "@/setup/linux";
export { runMacosSetup, type MacosSetupOptions } from "@/setup/macos";
export {
  syncByorSparseSource,
  syncMacosSource,
  syncSparseSource,
  type ByorSparseSourceOptions,
  type SparseSourceFile,
  type SparseSourceResult,
} from "@/setup/source";
export { validateMacosSource } from "@/setup/validate";
