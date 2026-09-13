import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import type { RunCommandResult } from "@/process";
import { WINDOWS_SETUP_MANIFEST_PATHS } from "@/setup/manifests";
import { runSetup } from "@/setup/run";
import { parseScoopManifest, updateScoop } from "@/update/scoop";
import { scoopScriptPath } from "@/update/scoop-command";
import { updateWindowsAll } from "@/update/windows-all";
import {
  captureBunGlobalInventory,
  captureScoopInventory,
  exportWingetInventory,
  SCOOP_INVENTORY_FORMAT,
} from "@/update/windows-snapshot";
import { updateWinget } from "@/update/winget";

const ok = (stdout = ""): RunCommandResult => ({ code: 0, stdout, stderr: "" });
const execFileAsync = promisify(execFile);
const windowsEntry = fileURLToPath(new URL("../index.windows.ts", import.meta.url));

async function runWindowsCli(args: string[]): Promise<{ code: number; text: string }> {
  try {
    const result = await execFileAsync("bun", [windowsEntry, ...args], {
      encoding: "utf8",
    });
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
  test("registers Windows update and setup commands without macOS PM implementations", async () => {
    const root = await runWindowsCli(["--help"]);
    const update = await runWindowsCli(["update", "--help"]);
    const setup = await runWindowsCli(["setup", "--help"]);
    const foreign = await runWindowsCli(["update", "brew"]);

    expect(root.code).toBe(0);
    expect(root.text).toMatch(/\bsetup\b/);
    expect(update.text).toMatch(/\bwinget\b/);
    expect(update.text).toMatch(/\bscoop\b/);
    expect(update.text).toMatch(/\bbun\b/);
    expect(update.text).toMatch(/\ball\b/);
    expect(setup.text).toMatch(/scoop\.txt/);
    expect(foreign.code).not.toBe(0);
    expect(foreign.text).toMatch(/macOS/);
  });
});

describe("Windows Scoop manifest", () => {
  test("parses buckets, bucket-qualified packages, and comments", () => {
    expect(
      parseScoopManifest(`
# Windows package state
bucket "https://github.com/sheeki03/scoop-tirith.git"
package "tirith"
package "extras/rustic"
`),
    ).toEqual({
      buckets: [{ name: "tirith", url: "https://github.com/sheeki03/scoop-tirith.git" }],
      packages: ["tirith", "extras/rustic"],
    });
  });

  test("rejects duplicate packages by resolved name and empty desired state", () => {
    expect(() => parseScoopManifest('package "extras/fzf"\npackage "fzf"')).toThrow(
      /duplicate package/,
    );
    expect(() => parseScoopManifest("# no packages\n")).toThrow(/contains no packages/);
  });
});

describe("Windows inventory snapshots", () => {
  test("sorts Scoop apps and buckets while preserving stable fields", async () => {
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
    expect(body).toContain(`"format": "${SCOOP_INVENTORY_FORMAT}"`);
    expect(body.indexOf('"Name": "alpha"')).toBeLessThan(body.indexOf('"Name": "zulu"'));
    expect(body.indexOf('"Name": "alpha"')).toBeLessThan(body.indexOf('"Name": "zeta"'));
    expect(body).not.toMatch(/timestamp|fetchedAt/i);
  });

  test("normalizes Scoop's one-item export shape and null source", async () => {
    const body = await captureScoopInventory(async () =>
      ok(
        JSON.stringify({
          apps: { Name: "solo", Source: null, Version: "1", Info: "" },
          buckets: { Name: "main", Source: "https://main" },
        }),
      ),
    );
    expect(JSON.parse(body)).toEqual({
      format: SCOOP_INVENTORY_FORMAT,
      apps: [{ Name: "solo", Source: "", Version: "1", Info: "" }],
      buckets: [{ Name: "main", Source: "https://main" }],
    });
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
    const root = await mkdtemp(join(tmpdir(), "outfitting-winget-test-"));
    try {
      const output = join(root, "winget.json");
      await expect(
        exportWingetInventory(output, async (_command, args) => {
          await writeFile(args[2]!, '{"Sources":[]}\n', "utf8");
          return ok();
        }),
      ).resolves.toBe(output);
      await expect(readFile(output, "utf8")).resolves.toContain("Sources");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("Windows package update commands", () => {
  test("executes Scoop's cmd shim through its PowerShell sibling", () => {
    expect(scoopScriptPath("C:\\scoop\\shims\\scoop.cmd")).toBe("C:\\scoop\\shims\\scoop.ps1");
    expect(scoopScriptPath("C:\\scoop\\shims\\scoop.ps1")).toBe("C:\\scoop\\shims\\scoop.ps1");
  });

  test("reconciles Scoop in order and supports --no-sync", async () => {
    const calls: string[] = [];
    const state = JSON.stringify({
      apps: [
        { Name: "old", Source: "main", Version: "1", Info: "" },
        { Name: "global-tool", Source: "main", Version: "1", Info: "Global install" },
      ],
      buckets: [],
    });
    const run = async (command: string, args: ReadonlyArray<string>) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (args.at(-1) === "export") {
        return ok(state);
      }
      if (command === "powershell.exe") {
        return ok(JSON.stringify([{ Source: "main", Name: "dep-one" }]));
      }
      return ok();
    };

    await Effect.runPromise(
      updateScoop({
        config: {
          stateRoot: "/tmp/outfitting-state",
          machineId: "test:x64-windows",
          machineIdOverridden: true,
          manifest: {
            baseUrl: "https://example.test/outfitting",
            ref: "test",
          },
        },
        which: async () => "C:\\scoop\\shims\\scoop.ps1",
        run,
        fetcher: async () => new Response('package "new-package"\n'),
        noSync: true,
      }),
    );

    expect(calls).toEqual([
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 export",
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 install new-package",
      "powershell.exe -NoProfile -NonInteractive -Command $ErrorActionPreference = 'Stop'; $dependencies = @(& 'C:\\scoop\\shims\\scoop.ps1' depends -- 'new-package'); if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; $dependencies | ConvertTo-Json -Compress",
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 export",
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 uninstall old",
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 update",
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 update *",
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 cleanup *",
    ]);
  });

  test("WinGet uses upgrade-all and can skip inventory", async () => {
    const calls: string[][] = [];
    await Effect.runPromise(
      updateWinget({
        which: async () => "C:\\Windows\\winget.exe",
        run: async (command, args) => {
          calls.push([command, ...args]);
          return ok();
        },
        noSync: true,
      }),
    );
    expect(calls).toEqual([
      ["winget", "upgrade", "--all", "--accept-source-agreements", "--accept-package-agreements"],
    ]);
  });

  test("update all continues after a failed step and returns a failure", async () => {
    const calls: string[][] = [];
    const config = {
      stateRoot: "/tmp/outfitting-state",
      machineId: "test:x64-windows",
      machineIdOverridden: true,
      manifest: {
        baseUrl: "https://example.test/outfitting",
        ref: "test",
      },
    };

    await expect(
      Effect.runPromise(
        updateWindowsAll({
          config,
          noSync: true,
          which: async (command) =>
            command === "winget"
              ? "C:\\Windows\\winget.exe"
              : command === "scoop"
                ? "C:\\scoop\\shims\\scoop.cmd"
                : "C:\\Users\\test\\.bun\\bin\\bun.exe",
          run: async (command, args) => {
            calls.push([command, ...args]);
            if (command === "bun") {
              return ok("C:\\Users\\test\\.bun\\install\\global\\node_modules");
            }
            return { code: 1, stdout: "", stderr: "simulated failure" };
          },
        }),
      ),
    ).rejects.toThrow("winget, scoop");

    expect(calls).toEqual([
      ["winget", "upgrade", "--all", "--accept-source-agreements", "--accept-package-agreements"],
      [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "C:\\scoop\\shims\\scoop.ps1",
        "export",
      ],
      ["bun", "pm", "ls", "-g"],
    ]);
  });
});

describe("Windows setup manifest selection", () => {
  test("materializes Scoop and Bun without macOS symlink work", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-setup-"));
    try {
      const fetched: string[] = [];
      await Effect.runPromise(
        runSetup({
          stateRoot: root,
          manifestPaths: WINDOWS_SETUP_MANIFEST_PATHS,
          fetcher: async (url) => {
            fetched.push(url);
            return new Response(url.includes("scoop") ? 'package "fzf"\n' : "alchemy\n");
          },
          nextCommand: "Next: outfitting-manager update winget|scoop|bun|all",
        }),
      );
      expect(fetched).toEqual([
        "https://raw.githubusercontent.com/jfalava/outfitting/main/packages/windows/scoop.txt",
        "https://raw.githubusercontent.com/jfalava/outfitting/main/packages/bun.txt",
      ]);
      await expect(
        readFile(join(root, "manifests/packages/windows/scoop.txt"), "utf8"),
      ).resolves.toBe('package "fzf"\n');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
