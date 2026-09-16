export {
  MACOS_SOURCE_PATHS,
  prefetchSetupManifests,
  SETUP_MANIFEST_PATHS,
  WINDOWS_SETUP_MANIFEST_PATHS,
  windowsSetupManifestPaths,
} from "@/setup/manifests";
export { runSetup, type SetupOptions } from "@/setup/run";
export { syncMacosSource, type SparseSourceFile, type SparseSourceResult } from "@/setup/source";
