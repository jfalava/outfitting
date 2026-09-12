import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { foreignPackageManagerStub, notImplementedYet } from "@/commands/update/stubs";
import { foreignPackageManagerMessage } from "@/platform";

const execFileAsync = promisify(execFile);
const cliEntry = fileURLToPath(new URL("../index.macos.ts", import.meta.url));

const runCli = async (args: string[]) => {
  try {
    const result = await execFileAsync("bun", [cliEntry, ...args], {
      encoding: "utf8",
      env: process.env,
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

  test("update bun is registered but not implemented", async () => {
    const { code, stdout, stderr } = await runCli(["update", "bun"]);
    expect(code).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/not implemented yet/i);
  });

  test("update nix switch is registered but not implemented", async () => {
    const { code, stdout, stderr } = await runCli(["update", "nix", "switch"]);
    expect(code).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/not implemented yet/i);
  });

  test("update scoop is a foreign hint stub", async () => {
    const { code, stdout, stderr } = await runCli(["update", "scoop"]);
    expect(code).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toContain("Windows");
    expect(`${stdout}\n${stderr}`).toMatch(/scoop/i);
  });

  test("setup is registered but not implemented", async () => {
    const { code, stdout, stderr } = await runCli(["setup"]);
    expect(code).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/not implemented yet/i);
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
