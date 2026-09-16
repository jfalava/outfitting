import { access, readFile, writeFile } from "node:fs/promises";

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
  manifest: { baseUrl: "https://example.test/outfitting", ref: "main" },
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
      expect(lock.lockPath).toBe(`${lock.lockDir}/flake.lock`);
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
    expect(attemptedPath).toBeDefined();
    await expect(access(attemptedPath!.replace(/\/flake\.lock$/, ""))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
