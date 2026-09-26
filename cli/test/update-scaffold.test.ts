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

describe("macOS CLI command boundaries", () => {
  test("root help exposes distinct preparation, reconciliation, native update, Nix, and self-update commands", async () => {
    const { code, stdout, stderr } = await runCli(["--help"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).toBe(0);
    expect(text).toMatch(/\binit\b/);
    expect(text).toMatch(/\bapply\b/);
    expect(text).toMatch(/\bnix\b/);
    expect(text).toMatch(/\bupdate\b/);
    expect(text).toMatch(/\bself-update\b/);
    expect(text).toMatch(/self-update.*upgrade/);
    expect(text).not.toMatch(/^\s+setup\s/m);
    expect(text).toMatch(/\bdiff\b/);
    expect(text).toMatch(/\bsync\b/);
    expect(text).not.toMatch(/^\s+lockfiles\s/m);
    expect(text).toMatch(/^\s+status\s/m);
    expect(text).toMatch(/\bsnapshot\b/);
    expect(text).toMatch(/\brecover\b/);
  });

  test("upgrade resolves to the self-update command help", async () => {
    const { code, stdout, stderr } = await runCli(["upgrade", "--help"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).toBe(0);
    expect(text).toMatch(/Check for and install the latest outfitting-manager release/);
  });

  test("update help describes native Homebrew upgrades, not an aggregate command", async () => {
    const { code, stdout, stderr } = await runCli(["update", "--help"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).toBe(0);
    expect(text).toMatch(/Homebrew/i);
    expect(text).not.toMatch(/\bnix\b|subcommands/i);
  });

  test("update rejects a foreign package-manager selection", async () => {
    const { code, stdout, stderr } = await runCli(["update", "--package-manager", "scoop"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).not.toBe(0);
    expect(text).toMatch(/apt|pacman|brew|invalid|unexpected/i);
  });

  test("Nix dry-run is a top-level action and fails fast without a configured repo", async () => {
    const { code, stdout, stderr } = await runCliWithEnv(["nix", "dry-run"], {
      OUTFITTING_REPO: "/tmp/definitely-not-an-outfitting-repo",
    });
    const text = `${stdout}\n${stderr}`;
    expect(code).not.toBe(0);
    expect(text).not.toMatch(/not implemented yet/i);
    expect(text).toMatch(
      /missing system\/macos\/flake\.nix|does not exist|not configured|not installed|No Linux BYOR profile is selected/i,
    );
  });

  test("Nix without an action lists actions and does not switch", async () => {
    const { stdout, stderr } = await runCliWithEnv(["nix"], {
      OUTFITTING_REPO: "/tmp/definitely-not-an-outfitting-repo",
    });
    const text = `${stdout}\n${stderr}`;
    expect(text).not.toMatch(/not implemented yet/i);
    // Must not attempt a real switch/build when no action is given.
    expect(text).not.toMatch(
      /missing system\/macos\/flake\.nix|Building nix-darwin|Activating nix-darwin/i,
    );
    expect(text).toMatch(/build|switch|test|dry-run/i);

    const help = await runCli(["nix", "--help"]);
    expect(help.code).toBe(0);
    expect(`${help.stdout}\n${help.stderr}`).toMatch(/build|switch|test|dry-run/);
  });

  test("update requires an explicit package manager on Linux and rejects removed Nix routing", async () => {
    const { code, stdout, stderr } = await runCli(["update", "nix"]);
    expect(code).not.toBe(0);
    expect(`${stdout}\n${stderr}`).not.toMatch(/Building nix-darwin|Activating nix-darwin/i);
  });

  test("init is the non-applying macOS preparation command", async () => {
    const { code, stdout, stderr } = await runCli(["init", "--help"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).toBe(0);
    expect(text).toMatch(/prepare and validate/i);
    expect(text).toMatch(/without applying/i);
  });

  test("apply reconciles the macOS Brewfile and leaves Nix to its own command", async () => {
    const { code, stdout, stderr } = await runCli(["apply", "--help"]);
    const text = `${stdout}\n${stderr}`;
    expect(code).toBe(0);
    expect(text).toMatch(/Brewfile|Homebrew/i);
    expect(text).toMatch(/profile/i);
    expect(text).not.toMatch(/Nix and Homebrew/i);
  });

  test("the removed composite setup command is not registered", async () => {
    const { code, stdout, stderr } = await runCli(["setup", "--help"]);
    const text = `${stdout}\n${stderr}`;
    expect(text).not.toMatch(/^\s+setup\s/m);
    expect(text).not.toMatch(/Nix and Homebrew/i);
    expect(code).toBe(0);
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
