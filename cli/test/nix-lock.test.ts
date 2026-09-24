import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import type { ManagerConfig } from "@/config";
import { CliFailure } from "@/errors";
import type { PullLockfileOptions } from "@/lockfiles";
import { closeNixLock, openNixLock } from "@/update/nix/lock";

const config: ManagerConfig = {
  stateRoot: "/state",
  machineId: "test:aarch64-darwin",
  machineIdOverridden: true,
};

describe("openNixLock", () => {
  test("returns the pulled lock and removes it when closed", async () => {
    const pull = (options: PullLockfileOptions) =>
      Effect.promise(async () => {
        await writeFile(options.outPath!, '{ "version": 7 }\n');
        return undefined;
      });

    const lock = await openNixLock(config, pull);
    try {
      expect(await readFile(lock.lockPath, "utf8")).toContain('"version": 7');
    } finally {
      await closeNixLock(lock.lockDir);
    }

    await expect(access(lock.lockDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("fails closed with the pull error and cleans up the temporary directory", async () => {
    let attemptedPath: string | undefined;
    const pull = (options: PullLockfileOptions) => {
      attemptedPath = options.outPath;
      return Effect.fail(new CliFailure({ message: "service unavailable" }));
    };

    await expect(openNixLock(config, pull)).rejects.toThrow(
      /Could not pull the required remote Nix lock.*service unavailable.*retry/,
    );
    expect(attemptedPath).toMatch(/\/flake\.lock$/);
    await expect(access(dirname(attemptedPath!))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("uses a local fallback when the remote lock is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-nix-lock-fallback-"));
    const fallbackPath = join(root, "flake.lock");
    await writeFile(fallbackPath, '{ "version": 7, "inputs": {} }\n');
    const pull = () => Effect.fail(new CliFailure({ message: "Lockfile not found" }));

    try {
      const lock = await openNixLock(config, pull, { fallbackPath });
      try {
        expect(await readFile(lock.lockPath, "utf8")).toContain('"inputs"');
        expect(lock.warning).toContain("using the local flake.lock");
      } finally {
        await closeNixLock(lock.lockDir);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("can continue without either remote or local lock", async () => {
    const pull = () => Effect.fail(new CliFailure({ message: "Lockfile not found" }));
    const lock = await openNixLock(config, pull, { allowMissing: true });

    expect(lock.lockDir).toBe("");
    expect(lock.lockPath).toBe("");
    expect(lock.warning).toContain("continuing with the local flake");
  });
});
