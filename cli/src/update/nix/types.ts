import type { NixAction } from "@/platform";

export type { NixAction };

export const NIX_LOCK_KIND = "nix";

export const NIX_SYSTEM_ATTR = "darwinConfigurations.macos.system";

export type NixRecoveryPhase = "prepared" | "activated";

export const NIX_RECOVERY_PHASES = ["prepared", "activated"] as const satisfies readonly NixRecoveryPhase[];

export function isNixRecoveryPhase(value: string): value is NixRecoveryPhase {
  return (NIX_RECOVERY_PHASES as readonly string[]).includes(value);
}
