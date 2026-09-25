import { loadConfig } from "@/config";
import { tryPromise } from "@/lockfiles/effect";

/**
 * Resolve the machine id for lockfile commands.
 * Explicit CLI value wins; otherwise OUTFITTING_MACHINE_ID → config.toml → auto.
 */
export const resolveLockfileMachine = (machine?: string) =>
  tryPromise(async () => {
    const explicit = machine?.trim();
    if (explicit !== undefined && explicit.length > 0) {
      return explicit;
    }
    const config = await loadConfig();
    return config.machineId;
  });
