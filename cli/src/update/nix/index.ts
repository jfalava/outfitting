export { activateNixSystem } from "@/update/nix/activate";
export { buildNixSystem } from "@/update/nix/build";
export { closeNixLock, openNixLock } from "@/update/nix/lock";
export {
  clearNixRecovery,
  defaultNixRecoveryDir,
  hasNixRecovery,
  nextRecoveryAction,
  prepareNixRecovery,
  readNixRecovery,
  setNixRecoveryPhase,
} from "@/update/nix/recovery";
export { updateNix } from "@/update/nix/run";
export { ensureNixSymlinks } from "@/update/nix/symlinks";
export {
  isNixRecoveryPhase,
  NIX_LOCK_KIND,
  NIX_RECOVERY_PHASES,
  NIX_SYSTEM_ATTR,
  type NixAction,
  type NixRecoveryPhase,
} from "@/update/nix/types";
