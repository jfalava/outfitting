export {
  LINUX_SOURCE_PATHS,
  MACOS_SOURCE_PATHS,
  prefetchSetupManifests,
  SETUP_MANIFEST_PATHS,
  WINDOWS_SETUP_MANIFEST_PATHS,
  windowsSetupManifestPaths,
} from "@/setup/manifests";
export { runSetup, type SetupOptions } from "@/setup/run";
export { runLinuxSetup, type LinuxSetupOptions } from "@/setup/linux";
export { runMacosSetup, type MacosSetupOptions } from "@/setup/macos";
export {
  syncMacosSource,
  syncSparseSource,
  type SparseSourceFile,
  type SparseSourceResult,
} from "@/setup/source";
export { validateMacosSource } from "@/setup/validate";
