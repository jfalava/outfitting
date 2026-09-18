import type { NixAction } from "@/platform";

export type { NixAction };

export const NIX_LOCK_KIND = "nix";

/** Default macOS nix-darwin system attr (kept for callers that hard-code macOS). */
export const NIX_SYSTEM_ATTR = "darwinConfigurations.macos.system";

/** Home Manager activation package attr for a named configuration. */
export function homeManagerActivationAttr(name: string): string {
  return `homeConfigurations.${name}.activationPackage`;
}

export type NixRecoveryPhase = "prepared" | "activated";

export const NIX_RECOVERY_PHASES = [
  "prepared",
  "activated",
] as const satisfies readonly NixRecoveryPhase[];

export function isNixRecoveryPhase(value: string): value is NixRecoveryPhase {
  return (NIX_RECOVERY_PHASES as readonly string[]).includes(value);
}
