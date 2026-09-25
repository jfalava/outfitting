import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const cliEntry = fileURLToPath(new URL("../index.macos.ts", import.meta.url));

const runCliWithEnv = async (args: string[], env: Record<string, string | undefined> = {}) => {
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

describe("macos CLI scaffold (process)", () => {
  test("root help lists shared verbs without the removed lockfiles alias", async () => {
    const { code, stdout, stderr } = await runCli(["--help"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).toBe(0);
    expect(text).toMatch(/\bsetup\b/);
    expect(text).toMatch(/\bupdate\b/);
    expect(text).toMatch(/\bdiff\b/);
    expect(text).toMatch(/\bsync\b/);
    expect(text).not.toMatch(/^\s+lockfiles\s/m);
    expect(text).toMatch(/^\s+status\s/m);
    expect(text).toMatch(/\bsnapshot\b/);
    expect(text).toMatch(/\brecover\b/);
  });

  test("bare update exits nonzero and shows usage", async () => {
    const { code, stdout, stderr } = await runCli(["update"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).not.toBe(0);
    expect(text).toMatch(/update/i);
  });

  test("update exposes one subcommand per package origin", async () => {
    const { code, stdout, stderr } = await runCli(["update", "--help"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).toBe(0);
    for (const manager of ["nix", "brew", "all"]) {
      expect(text).toMatch(new RegExp(`\\b${manager}\\b`));
    }
    expect(text).not.toMatch(/update[-_]all/i);
  });

  test("update bun is removed without a migration handler", async () => {
    const { code, stdout, stderr } = await runCli(["update", "bun"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).not.toBe(0);
    expect(text).not.toMatch(/deprecated/i);
    expect(text).not.toMatch(/^\s+bun\s/m);
  });

  test("update nix dry is registered (fails fast without repo rather than stub)", async () => {
    const { code, stdout, stderr } = await runCliWithEnv(["update", "nix", "dry"], {
      OUTFITTING_REPO: "/tmp/definitely-not-an-outfitting-repo",
    });
    const text = `${stdout}\n${stderr}`;
    expect(code).not.toBe(0);
    expect(text).not.toMatch(/not implemented yet/i);
    expect(text).toMatch(
      /missing system\/macos\/flake\.nix|does not exist|not configured|not installed|No Linux BYOR profile is selected/i,
    );
  });

  test("update nix without an action lists subcommands and does not switch", async () => {
    const { stdout, stderr } = await runCliWithEnv(["update", "nix"], {
      OUTFITTING_REPO: "/tmp/definitely-not-an-outfitting-repo",
    });
    const text = `${stdout}\n${stderr}`;
    expect(text).not.toMatch(/not implemented yet/i);
    // Must not attempt a real switch/build when no action is given.
    expect(text).not.toMatch(
      /missing system\/macos\/flake\.nix|Building nix-darwin|Activating nix-darwin/i,
    );
    expect(text).toMatch(/build|switch|test|dry/i);

    const help = await runCli(["update", "nix", "--help"]);
    expect(help.code).toBe(0);
    expect(`${help.stdout}\n${help.stderr}`).toMatch(/build|switch|test|dry/);
  });

  test("update scoop is a foreign hint stub", async () => {
    const { code, stdout, stderr } = await runCli(["update", "scoop"]);
    expect(code).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toContain("Windows");
    expect(`${stdout}\n${stderr}`).toMatch(/scoop/i);
  });

  test("init is the non-applying macOS preparation command", async () => {
    const { code, stdout, stderr } = await runCli(["init", "--help"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).toBe(0);
    expect(text).toMatch(/prepare and validate/i);
    expect(text).toMatch(/without applying/i);
  });

  test("setup is the applying macOS command", async () => {
    const { code, stdout, stderr } = await runCli(["setup", "--help"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).toBe(0);
    expect(text).toMatch(/apply/i);
    expect(text).toMatch(/Nix and Homebrew/i);
  });

  test("sync exposes remote transport and lockfiles is rejected", async () => {
    const sync = await runCli(["sync", "--help"]);
    const lockfiles = await runCli(["lockfiles"]);
    expect(sync.code).toBe(0);
    expect(lockfiles.code).not.toBe(0);
    expect(`${sync.stdout}\n${sync.stderr}`).toMatch(/\bpush\b/);
    expect(`${lockfiles.stdout}\n${lockfiles.stderr}`).not.toMatch(/^\s+lockfiles\s/m);
  });
});
