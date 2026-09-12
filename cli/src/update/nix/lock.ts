import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { physicalPath } from "@/config/repo";
import type { ManagerConfig } from "@/config";
import { pullLockfile } from "@/lockfiles";
import { Effect } from "effect";
import { NIX_LOCK_KIND } from "@/update/nix/types";

export interface OpenNixLockResult {
  /** Physical temp directory holding flake.lock (empty string when pull failed). */
  lockDir: string;
  /** Path to pulled flake.lock, or undefined when using local lock only. */
  lockPath: string | undefined;
  usedRemote: boolean;
  warning?: string;
}

/**
 * Pull the remote nix lock into a physical temp path.
 * On failure, returns usedRemote=false so callers fall back to local flake.lock.
 * Caller must invoke `closeNixLock` when done.
 */
export async function openNixLock(config: ManagerConfig): Promise<OpenNixLockResult> {
  const displayDir = await mkdtemp(join(tmpdir(), "outfitting-nix-lock-"));
  let lockDir: string;
  try {
    lockDir = await physicalPath(displayDir);
  } catch {
    await rm(displayDir, { force: true, recursive: true });
    throw new Error("Could not resolve a physical temporary Nix lock directory.");
  }

  const lockPath = join(lockDir, "flake.lock");

  try {
    await Effect.runPromise(
      pullLockfile({
        machine: config.machineId,
        kind: NIX_LOCK_KIND,
        outPath: lockPath,
      }),
    );
    return { lockDir, lockPath, usedRemote: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await closeNixLock(lockDir);
    return {
      lockDir: "",
      lockPath: undefined,
      usedRemote: false,
      warning: `Failed to pull remote Nix lock (${message}). Continuing with local flake.lock.`,
    };
  }
}

export async function closeNixLock(lockDir: string): Promise<void> {
  if (lockDir.length === 0) {
    return;
  }
  await rm(join(lockDir, "flake.lock"), { force: true });
  await rm(join(lockDir, "updated-flake.lock"), { force: true });
  await rm(lockDir, { force: true, recursive: true });
}
