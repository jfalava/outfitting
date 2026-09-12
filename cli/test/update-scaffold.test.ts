import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { foreignPackageManagerStub, notImplementedYet } from "@/commands/update/stubs";
import { foreignPackageManagerMessage } from "@/platform";

const execFileAsync = promisify(execFile);
const cliEntry = fileURLToPath(new URL("../index.macos.ts", import.meta.url));

const runCliWithEnv = async (
  args: string[],
  env: Record<string, string | undefined> = {},
) => {
  try {
    const result = await execFileAsync("bun", [cliEntry, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const err = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
    };
  }
};

const runCli = async (args: string[]) => runCliWithEnv(args);

describe("update / setup stub effects", () => {
  test("notImplementedYet fails with path", async () => {
    await expect(Effect.runPromise(notImplementedYet("update bun"))).rejects.toThrow(
      /update bun is not implemented yet/,
    );
  });

  test("foreign scoop hint names Windows build", async () => {
    await expect(Effect.runPromise(foreignPackageManagerStub("scoop", "macos"))).rejects.toThrow(
      foreignPackageManagerMessage("scoop", "macos"),
    );
  });
});

describe("macos CLI scaffold (process)", () => {
  test("root help lists setup, update, sync, lockfiles", async () => {
    const { code, stdout, stderr } = await runCli(["--help"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).toBe(0);
    expect(text).toMatch(/\bsetup\b/);
    expect(text).toMatch(/\bupdate\b/);
    expect(text).toMatch(/\bsync\b/);
    expect(text).toMatch(/\blockfiles\b/);
  });

  test("bare update exits nonzero and shows usage", async () => {
    const { code, stdout, stderr } = await runCli(["update"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).not.toBe(0);
    expect(text).toMatch(/update/i);
  });

  test("update bun is registered (runs or fails on missing bun)", async () => {
    const { code, stdout, stderr } = await runCli(["update", "bun"]);
    const text = `${stdout}\n${stderr}`;
    // Either bun is present and the updater runs, or it hard-fails if missing.
    expect(text).not.toMatch(/not implemented yet/i);
    if (code !== 0) {
      expect(text).toMatch(/Bun is not installed|failure/i);
    }
  });

  test("update nix dry is registered (fails fast without repo rather than stub)", async () => {
    const { code, stdout, stderr } = await runCliWithEnv(["update", "nix", "dry"], {
      OUTFITTING_REPO: "/tmp/definitely-not-an-outfitting-repo",
    });
    const text = `${stdout}\n${stderr}`;
    expect(code).not.toBe(0);
    expect(text).not.toMatch(/not implemented yet/i);
    expect(text).toMatch(/missing system\/macos\/flake\.nix|not configured|not installed/i);
  });

  test("update scoop is a foreign hint stub", async () => {
    const { code, stdout, stderr } = await runCli(["update", "scoop"]);
    expect(code).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toContain("Windows");
    expect(`${stdout}\n${stderr}`).toMatch(/scoop/i);
  });

  test("setup materializes a state root", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "outfitting-setup-cli-"));
    try {
      const { code, stdout, stderr } = await runCliWithEnv(["setup"], {
        OUTFITTING_STATE_ROOT: root,
      });
      expect(code).toBe(0);
      expect(`${stdout}\n${stderr}`).toMatch(/State root ready/i);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("sync and lockfiles both expose push subcommand help", async () => {
    const sync = await runCli(["sync", "--help"]);
    const lockfiles = await runCli(["lockfiles", "--help"]);
    expect(sync.code).toBe(0);
    expect(lockfiles.code).toBe(0);
    expect(`${sync.stdout}\n${sync.stderr}`).toMatch(/\bpush\b/);
    expect(`${lockfiles.stdout}\n${lockfiles.stderr}`).toMatch(/\bpush\b/);
  });
});
