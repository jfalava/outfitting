import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Effect } from "effect";
import { afterEach, describe, expect, test } from "vitest";

import { parseWindowsPackageList } from "@/commands/windows-apply";
import { windowsPackageCommandArgs } from "@/commands/windows-packages";
import type { ManagerConfig } from "@/config";
import type { RunCommandResult } from "@/process";
import { parseScoopManifest, updateScoop } from "@/update/scoop";
import { scoopScriptPath } from "@/update/scoop-command";
import { readWindowsLock, recordWindowsOperation, windowsLockPath } from "@/update/windows-lock";
import {
  captureBunGlobalInventory,
  captureScoopInventory,
  exportWingetInventory,
} from "@/update/windows-snapshot";
import { updateWinget, wingetPackageArgs } from "@/update/winget";

const temps: string[] = [];
const ok = (stdout = ""): RunCommandResult => ({ code: 0, stdout, stderr: "" });
const execFileAsync = promisify(execFile);
const windowsEntry = fileURLToPath(new URL("../index.windows.ts", import.meta.url));

afterEach(async () => {
  await Promise.all(temps.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temps.push(root);
  return root;
}

async function runWindowsCli(args: string[]): Promise<{ code: number; text: string }> {
  try {
    const result = await execFileAsync("bun", [windowsEntry, ...args], { encoding: "utf8" });
    return { code: 0, text: `${result.stdout}\n${result.stderr}` };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      text: `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`,
    };
  }
}

describe("Windows CLI entrypoint", () => {
  test("registers config, source, init, setup, and update", async () => {
    const root = await runWindowsCli(["--help"]);
    const config = await runWindowsCli(["config", "--help"]);
    const source = await runWindowsCli(["source", "--help"]);
    const init = await runWindowsCli(["init", "--help"]);
    const setup = await runWindowsCli(["setup", "--help"]);
    const update = await runWindowsCli(["update", "--help"]);
    const foreign = await runWindowsCli(["update", "brew"]);

    expect(root.code).toBe(0);
    expect(root.text).toMatch(/\bconfig\b/);
    expect(root.text).toMatch(/\bsource\b/);
    expect(root.text).toMatch(/\binit\b/);
    expect(config.text).toMatch(/migrate|show/i);
    expect(source.text).toMatch(/path/i);
    expect(init.text).toMatch(/source/i);
    expect(init.text).toMatch(/--no-refresh/);
    expect(setup.text).toMatch(/profile|apply/i);
    expect(update.text).toMatch(/\bwinget\b/);
    expect(update.text).toMatch(/\bscoop\b/);
    expect(update.text).toMatch(/\ball\b/);
    expect(update.text).not.toMatch(/--manifest|--route/);
    expect(foreign.code).not.toBe(0);
  }, 15_000);
});

describe("WinGet declarations and commands", () => {
  test("deduplicates package IDs and rejects command fragments", () => {
    expect(
      parseWindowsPackageList("# comment\nGit.Git\ngit.git\nOven-sh.Bun\n", "base.txt"),
    ).toEqual([{ name: "Git.Git" }, { name: "Oven-sh.Bun" }]);
    expect(() => parseWindowsPackageList("Git.Git --silent\n", "base.txt")).toThrow(
      /Invalid WinGet/,
    );
  });

  test("accepts agreements for installation, never for uninstall", () => {
    expect(windowsPackageCommandArgs("winget", "install", "Git.Git")).toEqual([
      "install",
      "--id",
      "Git.Git",
      "--exact",
      "--accept-source-agreements",
      "--accept-package-agreements",
    ]);
    expect(windowsPackageCommandArgs("winget", "uninstall", "Git.Git")).toEqual([
      "uninstall",
      "--id",
      "Git.Git",
      "--exact",
      "--accept-source-agreements",
    ]);
    expect(wingetPackageArgs("uninstall", "Store.App", "msstore")).toContain("msstore");
  });
});

test("records Windows operations in the local lock", async () => {
  const root = await tempRoot("outfitting-windows-lock-");
  const config: ManagerConfig = {
    configPath: join(root, "config.toml"),
    stateRoot: root,
    machineId: "test:x64-windows",
    machineIdOverridden: true,
  };
  await recordWindowsOperation(
    {
      config,
      manager: "winget",
      action: "install",
      name: "Git.Git",
      args: ["install", "--id", "Git.Git"],
      status: "success",
      exitCode: 0,
    },
    { root },
  );
  await recordWindowsOperation(
    {
      config,
      manager: "winget",
      action: "uninstall",
      name: "Missing.Package",
      args: ["uninstall", "--id", "Missing.Package"],
      status: "failed",
      exitCode: 1,
    },
    { root },
  );
  await recordWindowsOperation(
    {
      config,
      manager: "winget",
      action: "uninstall",
      name: "Git.Git",
      args: ["uninstall", "--id", "Git.Git"],
      status: "success",
      exitCode: 0,
    },
    { root },
  );

  const lock = await readWindowsLock(config, { root });
  expect(lock.packages.winget).toEqual([]);
  expect(lock.operations).toHaveLength(3);
  expect(lock.operations[1]).toMatchObject({
    name: "Missing.Package",
    status: "failed",
    exitCode: 1,
  });
  expect(windowsLockPath({ root })).toContain("windows.lock.json");
});

describe("Scoop", () => {
  test("parses buckets, bucket-qualified packages, and comments", () => {
    expect(
      parseScoopManifest(
        [
          "# Windows package state",
          'bucket "https://github.com/sheeki03/scoop-tirith.git"',
          'package "tirith"',
          'package "extras/rustic"',
        ].join("\n"),
      ),
    ).toEqual({
      buckets: [{ name: "tirith", url: "https://github.com/sheeki03/scoop-tirith.git" }],
      packages: ["tirith", "extras/rustic"],
    });
    expect(() => parseScoopManifest('package "extras/fzf"\npackage "fzf"')).toThrow(
      /duplicate package/,
    );
  });

  test("executes Scoop's cmd shim through its PowerShell sibling", () => {
    expect(scoopScriptPath("C:\\scoop\\shims\\scoop.cmd")).toBe("C:\\scoop\\shims\\scoop.ps1");
  });

  test("updates Scoop without requiring any package source configuration", async () => {
    const calls: string[] = [];
    const stateRoot = await tempRoot("outfitting-scoop-update-");
    const config: ManagerConfig = {
      configPath: join(stateRoot, "config.toml"),
      stateRoot,
      machineId: "test:x64-windows",
      machineIdOverridden: true,
    };
    await Effect.runPromise(
      updateScoop({
        config,
        which: async () => "C:\\scoop\\shims\\scoop.ps1",
        noPush: true,
        run: async (command, args) => {
          calls.push(`${command} ${args.join(" ")}`);
          return ok();
        },
      }),
    );
    expect(calls).toEqual([
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 update",
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 update *",
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 cleanup *",
    ]);
  });
});

describe("Windows inventories and upgrades", () => {
  test("normalizes and sorts Scoop inventory", async () => {
    const body = await captureScoopInventory(async () =>
      ok(
        JSON.stringify({
          apps: [
            { Name: "zulu", Source: "main", Version: "2", Info: "" },
            { Name: "alpha", Source: "extras", Version: "1", Info: "" },
          ],
          buckets: [
            { Name: "zeta", Source: "https://zeta" },
            { Name: "alpha", Source: "https://alpha" },
          ],
        }),
      ),
    );
    expect(body.indexOf('"Name": "alpha"')).toBeLessThan(body.indexOf('"Name": "zulu"'));
    expect(body).not.toMatch(/timestamp|fetchedAt/i);
  });

  test("sorts and deduplicates global Bun package names", async () => {
    const body = await captureBunGlobalInventory(async () =>
      ok(
        ["/tmp/global/node_modules", "├── zed@1.0.0", "├── @scope/pkg@2.0.0", "└── zed@1.0.0"].join(
          "\n",
        ),
      ),
    );
    expect(body).toContain('"packages": [\n    "@scope/pkg",\n    "zed"\n  ]');
  });

  test("requires WinGet export to create the requested file", async () => {
    const root = await tempRoot("outfitting-winget-export-");
    const output = join(root, "winget.json");
    await exportWingetInventory(output, async (_command, args) => {
      await writeFile(args[2]!, '{"Sources":[]}\n', "utf8");
      return ok();
    });
    await expect(readFile(output, "utf8")).resolves.toContain("Sources");
  });

  test("WinGet upgrades all and writes local state without source configuration", async () => {
    const stateRoot = await tempRoot("outfitting-winget-update-");
    const calls: string[][] = [];
    await Effect.runPromise(
      updateWinget({
        config: {
          configPath: join(stateRoot, "config.toml"),
          stateRoot,
          machineId: "test:x86_64-windows",
          machineIdOverridden: true,
        },
        which: async () => "C:\\Windows\\winget.exe",
        run: async (command, args) => {
          calls.push([command, ...args]);
          return ok();
        },
        noPush: true,
      }),
    );
    expect(calls).toEqual([
      ["winget", "upgrade", "--all", "--accept-source-agreements", "--accept-package-agreements"],
    ]);
    expect(
      JSON.parse(await readFile(join(stateRoot, "windows.lock.json"), "utf8")).operations[0].action,
    ).toBe("upgrade");
  });
});
