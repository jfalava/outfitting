export { runSetup, type SetupOptions } from "@/setup/run";
export { runLinuxSetup, type LinuxSetupOptions } from "@/setup/linux";
export { runMacosSetup, type MacosSetupOptions } from "@/setup/macos";
export {
  syncByorSparseSource,
  type ByorSparseSourceOptions,
  type ByorSourceFile,
  type ByorSourceResult,
} from "@/setup/source";
export { validateMacosSource } from "@/setup/validate";
