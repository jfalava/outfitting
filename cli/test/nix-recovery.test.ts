import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  clearNixRecovery,
  hasNixRecovery,
  nextRecoveryAction,
  prepareNixRecovery,
  readNixRecovery,
  setNixRecoveryPhase,
} from "@/update/nix/recovery";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "outfitting-nix-rec-"));
  temps.push(dir);
  return dir;
}

describe("nextRecoveryAction", () => {
  test("prepared → activate, activated → publish", () => {
    expect(nextRecoveryAction("prepared")).toBe("activate");
    expect(nextRecoveryAction("activated")).toBe("publish");
  });
});

describe("nix recovery checkpoint", () => {
  test("prepare, set phase, clear", async () => {
    const parent = await tempDir();
    const recoveryDir = join(parent, "nix-lock-recovery");
    const lockSource = join(parent, "source.lock");
    await writeFile(lockSource, '{ "lock": true }\n', "utf8");

    expect(await hasNixRecovery(recoveryDir)).toBe(false);

    const state = await prepareNixRecovery({
      lockPath: lockSource,
      baseHash: "abc123",
      recoveryDir,
    });
    expect(state.phase).toBe("prepared");
    expect(await hasNixRecovery(recoveryDir)).toBe(true);
    expect(await readFile(state.lockPath, "utf8")).toContain("lock");

    const loaded = await readNixRecovery(recoveryDir);
    expect(loaded?.baseHash).toBe("abc123");
    expect(loaded?.phase).toBe("prepared");
    expect(nextRecoveryAction(loaded!.phase)).toBe("activate");

    await setNixRecoveryPhase("activated", recoveryDir);
    const after = await readNixRecovery(recoveryDir);
    expect(after?.phase).toBe("activated");
    expect(nextRecoveryAction(after!.phase)).toBe("publish");

    await expect(
      prepareNixRecovery({
        lockPath: lockSource,
        baseHash: "other",
        recoveryDir,
      }),
    ).rejects.toThrow(/already exists/);

    await clearNixRecovery(recoveryDir);
    expect(await hasNixRecovery(recoveryDir)).toBe(false);
    expect(await readNixRecovery(recoveryDir)).toBeUndefined();
  });
});
