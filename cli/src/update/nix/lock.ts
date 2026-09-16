import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";

import type { ManagerConfig } from "@/config";
import { physicalPath } from "@/config/repo";
import { pullLockfile } from "@/lockfiles";
import { NIX_LOCK_KIND } from "@/update/nix/types";

export interface OpenNixLockResult {
  /** Physical temp directory holding flake.lock. */
  lockDir: string;
  /** Path to the pulled flake.lock. */
  lockPath: string;
}

/**
 * Pull the remote nix lock into a physical temp path.
 * Caller must invoke `closeNixLock` when done.
 */
export async function openNixLock(
  config: ManagerConfig,
  pull: typeof pullLockfile = pullLockfile,
): Promise<OpenNixLockResult> {
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
      pull({
        machine: config.machineId,
        kind: NIX_LOCK_KIND,
        outPath: lockPath,
      }),
    );
    return { lockDir, lockPath };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await closeNixLock(lockDir);
    throw new Error(
      `Could not pull the required remote Nix lock for ${config.machineId}: ${message}. Check the lockfile service configuration and connectivity, then retry.`,
      { cause },
    );
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
