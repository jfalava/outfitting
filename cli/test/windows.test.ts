import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Console, Effect } from "effect";
import { describe, expect, test } from "vitest";

import {
  applyWindows,
  parseWindowsPackageList,
  resolveWindowsProfiles,
} from "@/commands/windows-apply";
import { windowsPackageCommandArgs } from "@/commands/windows-packages";
import { saveConfigFile } from "@/config";
import { fetchManifest } from "@/fetch";
import type { RunCommandResult } from "@/process";
import { WINDOWS_SETUP_MANIFEST_PATHS } from "@/setup/manifests";
import { runSetup } from "@/setup/run";
import { parseScoopManifest, updateScoop } from "@/update/scoop";
import { scoopScriptPath } from "@/update/scoop-command";
import { updateWindowsAll } from "@/update/windows-all";
import { readWindowsLock, recordWindowsOperation, windowsLockPath } from "@/update/windows-lock";
import {
  captureBunGlobalInventory,
  captureScoopInventory,
  exportWingetInventory,
} from "@/update/windows-snapshot";
import { updateWinget, wingetPackageArgs } from "@/update/winget";

const ok = (stdout = ""): RunCommandResult => ({ code: 0, stdout, stderr: "" });
const execFileAsync = promisify(execFile);
const windowsEntry = fileURLToPath(new URL("../index.windows.ts", import.meta.url));

async function runWindowsCli(
  args: string[],
  environment: Record<string, string> = {},
): Promise<{ code: number; text: string }> {
  try {
    const result = await execFileAsync("bun", [windowsEntry, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...environment },
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

describe("WinGet package arguments", () => {
  test("accepts package agreements for install, never uninstall", () => {
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
    expect(wingetPackageArgs("uninstall", "Store.App", "msstore")).toEqual([
      "uninstall",
      "--id",
      "Store.App",
      "--exact",
      "--source",
      "msstore",
      "--accept-source-agreements",
    ]);
  });
});

describe("Windows CLI entrypoint", () => {
  test("registers Windows config, init, setup, and update commands without macOS PM implementations", async () => {
    const root = await runWindowsCli(["--help"]);
    const update = await runWindowsCli(["update", "--help"]);
    const config = await runWindowsCli(["config", "--help"]);
    const init = await runWindowsCli(["init", "--help"]);
    const setup = await runWindowsCli(["setup", "--help"]);
    const diff = await runWindowsCli(["diff", "--help"]);
    const sync = await runWindowsCli(["sync", "--help"]);
    const apply = await runWindowsCli(["apply", "--help"]);
    const winget = await runWindowsCli(["winget", "--help"]);
    const scoop = await runWindowsCli(["scoop", "--help"]);
    const foreign = await runWindowsCli(["update", "brew"]);

    expect(root.code).toBe(0);
    expect(root.text).toMatch(/\bconfig\b/);
    expect(root.text).toMatch(/\binit\b/);
    expect(root.text).toMatch(/\bsetup\b/);
    expect(root.text).toMatch(/\bsync\b/);
    expect(root.text).toMatch(/\bwinget\b/);
    expect(root.text).toMatch(/\bscoop\b/);
    expect(update.text).toMatch(/\bwinget\b/);
    expect(update.text).toMatch(/\bscoop\b/);
    expect(update.text).not.toMatch(/^\s+bun\s/m);
    expect(update.text).toMatch(/\ball\b/);
    expect(config.text).toMatch(/repository|route/i);
    expect(config.text).toMatch(/--repo/);
    expect(config.text).toMatch(/--default-profiles/);
    expect(init.text).toMatch(/initialize/i);
    expect(setup.text).toMatch(/apply|profiles/i);
    expect(diff.text).toMatch(/compare|repository/i);
    expect(sync.text).not.toMatch(/--clean/);
    expect(sync.text).toMatch(/configure-worker/);
    expect(sync.text).not.toMatch(/--winget-only/);
    expect(apply.text).toMatch(/--winget-only/);
    expect(apply.text).toMatch(/--prune/);
    expect(apply.text).not.toMatch(/--no-push/);
    expect(winget.text).toMatch(/install/);
    expect(scoop.text).toMatch(/uninstall/);
    expect(foreign.code).not.toBe(0);
    expect(foreign.text).toMatch(/macOS/);
  }, 15_000);

  test("writes a partial flagged config without invoking the wizard", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-config-cli-"));
    try {
      const result = await runWindowsCli(
        [
          "config",
          "--repo",
          "https://github.com/me/my-fork",
          "--ref",
          "main",
          "--winget-profile-path",
          "packages/windows/{profile}.json",
        ],
        { OUTFITTING_STATE_ROOT: root },
      );

      expect(result.code).toBe(0);
      expect(JSON.parse(await readFile(join(root, "config.json"), "utf8"))).toEqual({
        manifest: {
          baseUrl: "https://raw.githubusercontent.com/me/my-fork",
          ref: "main",
        },
        windows: {
          wingetProfilePath: "packages/windows/{profile}.json",
        },
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("rejects invalid flagged values before changing the existing config", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-config-invalid-"));
    try {
      await saveConfigFile(
        {
          manifest: { baseUrl: "https://raw.githubusercontent.com/acme/config", ref: "old" },
          windows: { scoopPath: "packages/windows/scoop.txt" },
        },
        { stateRoot: root },
      );
      const before = await readFile(join(root, "config.json"), "utf8");

      const result = await runWindowsCli(["config", "--scoop-path", "../escape.txt"], {
        OUTFITTING_STATE_ROOT: root,
      });

      expect(result.code).not.toBe(0);
      expect(result.text).toMatch(/Scoop manifest route/);
      expect(await readFile(join(root, "config.json"), "utf8")).toBe(before);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("updates every flagged field while preserving omitted saved fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-config-fields-"));
    try {
      await saveConfigFile(
        {
          machineId: "kept:x86_64-windows",
          manifest: { baseUrl: "https://raw.githubusercontent.com/acme/old", ref: "old" },
          windows: {
            wingetProfilePath: "old/{profile}.txt",
            scoopPath: "old/scoop.txt",
            powershellProfilePath: "old/profile.ps1",
            fontListPath: "old/fonts.txt",
            registryPath: "old/registry",
            defaultProfiles: ["old"],
          },
        },
        { stateRoot: root },
      );

      const result = await runWindowsCli(
        [
          "config",
          "--repo",
          "https://github.com/me/my-fork",
          "--ref",
          "next",
          "--winget-profile-path",
          "packages/windows/{profile}.json",
          "--scoop-path",
          "packages/windows/scoop.txt",
          "--powershell-profile-path",
          "dotfiles/profile.ps1",
          "--font-list-path",
          "fonts/list.txt",
          "--registry-path",
          "system/windows/registry",
          "--default-profiles",
          "base,work",
        ],
        { OUTFITTING_STATE_ROOT: root },
      );

      expect(result.code).toBe(0);
      expect(JSON.parse(await readFile(join(root, "config.json"), "utf8"))).toEqual({
        machineId: "kept:x86_64-windows",
        manifest: {
          baseUrl: "https://raw.githubusercontent.com/me/my-fork",
          ref: "next",
        },
        windows: {
          wingetProfilePath: "packages/windows/{profile}.json",
          scoopPath: "packages/windows/scoop.txt",
          powershellProfilePath: "dotfiles/profile.ps1",
          fontListPath: "fonts/list.txt",
          registryPath: "system/windows/registry",
          defaultProfiles: ["base", "work"],
        },
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("Windows desired state and lock", () => {
  test("deduplicates profiles and package IDs while rejecting command fragments", () => {
    expect(resolveWindowsProfiles(["base,dev", "dev"], [])).toEqual(["base", "dev"]);
    expect(
      parseWindowsPackageList("# comment\nGit.Git\ngit.git\nOven-sh.Bun\n", "base.txt"),
    ).toEqual([{ name: "Git.Git" }, { name: "Oven-sh.Bun" }]);
    expect(() => parseWindowsPackageList("Git.Git --silent\n", "base.txt")).toThrow(
      /Invalid WinGet/,
    );
    expect(() => resolveWindowsProfiles(["../escape"], [])).toThrow(/Invalid Windows profile/);
  });

  test("records successful installs, failed operations, and uninstalls in one lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-lock-"));
    const config = {
      stateRoot: root,
      machineId: "test:x64-windows",
      machineIdOverridden: true,
      manifest: {
        baseUrl: "https://example.test/outfitting",
        ref: "test",
      },
    };
    try {
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
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("apply preserves manual and preinstalled packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-sync-"));
    const config = {
      stateRoot: root,
      machineId: "test:x64-windows",
      machineIdOverridden: true,
      manifest: {
        baseUrl: "https://example.test/outfitting",
        ref: "test",
      },
    };
    const calls: string[] = [];
    const output: string[] = [];
    const testConsole = Object.assign(Object.create(console), {
      log: (...args: ReadonlyArray<unknown>) => output.push(args.join(" ")),
    }) as Console.Console;
    const run = async (command: string, args: ReadonlyArray<string>) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "powershell.exe" && args.at(-1) === "export") {
        return ok(
          JSON.stringify({
            apps: [{ Name: "extra-scoop", Source: "main", Version: "1", Info: "" }],
            buckets: [],
          }),
        );
      }
      if (command === "powershell.exe" && args.some((arg) => arg.includes("depends"))) {
        return ok("[]");
      }
      return ok();
    };
    try {
      await recordWindowsOperation(
        {
          config,
          manager: "winget",
          action: "install",
          name: "Manual.Package",
          args: ["install", "--id", "Manual.Package"],
          status: "success",
          exitCode: 0,
        },
        { root },
      );
      await recordWindowsOperation(
        {
          config,
          manager: "scoop",
          action: "install",
          name: "extra-scoop",
          args: ["install", "extra-scoop"],
          status: "success",
          exitCode: 0,
        },
        { root },
      );

      for (const path of ["packages/windows/base.txt", "packages/windows/scoop.txt"]) {
        await fetchManifest({
          path,
          config,
          fetcher: async () =>
            new Response(path.includes("scoop") ? 'package "fzf"\n' : "Git.Git\n"),
        });
      }
      await Effect.runPromise(
        applyWindows({
          config,
          confirm: Effect.succeed(true),
          which: async (manager) => `C:\\${manager}.exe`,
          run,
        }).pipe(Effect.provideService(Console.Console, testConsole)),
      );

      const lock = await readWindowsLock(config, { root });
      expect(lock.packages.winget.map((entry) => entry.name)).toEqual(["Manual.Package"]);
      expect(lock.packages.scoop.map((entry) => entry.name)).toEqual(["extra-scoop", "fzf"]);
      await expect(
        readFile(join(root, "manifests/dotfiles/Microsoft.PowerShell_profile.ps1"), "utf8"),
      ).rejects.toThrow();
      expect(output.join("\n")).toContain("install Scoop: fzf");
      expect(calls.some((call) => call.includes("uninstall"))).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("can bootstrap the WinGet baseline before Scoop is installed", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-winget-only-"));
    const config = {
      stateRoot: root,
      machineId: "test:x64-windows",
      machineIdOverridden: true,
      manifest: {
        baseUrl: "https://example.test/outfitting",
        ref: "test",
      },
    };
    try {
      await fetchManifest({
        path: "packages/windows/base.txt",
        config,
        fetcher: async () => new Response("Git.Git\n"),
      });
      await Effect.runPromise(
        applyWindows({
          config,
          wingetOnly: true,
          yes: true,
          which: async (manager) => (manager === "winget" ? "C:\\Windows\\winget.exe" : undefined),
          run: async (_command, args) =>
            args[0] === "list" ? { ...ok(), code: -1978335212 } : ok(),
        }),
      );

      const lock = await readWindowsLock(config, { root });
      expect(lock.profiles).toEqual(["base"]);
      expect(lock.packages.winget.map((entry) => entry.name)).toEqual(["Git.Git"]);
      expect(lock.packages.scoop).toEqual([]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
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

  test("rejects duplicate packages by resolved name and permits an empty declaration", () => {
    expect(() => parseScoopManifest('package "extras/fzf"\npackage "fzf"')).toThrow(
      /duplicate package/,
    );
    expect(parseScoopManifest("# no packages\n")).toEqual({ buckets: [], packages: [] });
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
    expect(body).toContain('"format": "outfitting-scoop-inventory-v1"');
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
      format: "outfitting-scoop-inventory-v1",
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
      await exportWingetInventory(output, async (_command, args) => {
        await writeFile(args[2]!, '{"Sources":[]}\n', "utf8");
        return ok();
      });
      await expect(readFile(output, "utf8")).resolves.toContain("Sources");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("Windows package update commands", () => {
  test("executes Scoop's cmd shim through its PowerShell sibling", () => {
    expect(scoopScriptPath("C:\\scoop\\shims\\scoop.cmd")).toBe("C:\\scoop\\shims\\scoop.ps1");
  });

  test("installs and updates Scoop while preserving packages outside the manifest", async () => {
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
        noPush: true,
      }),
    );

    expect(calls).toEqual([
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 update",
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 update *",
      "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\scoop\\shims\\scoop.ps1 cleanup *",
    ]);
  });

  test("WinGet uses upgrade-all and writes local state when upload is skipped", async () => {
    const calls: string[][] = [];
    const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-winget-update-"));
    try {
      await Effect.runPromise(
        updateWinget({
          config: {
            stateRoot,
            machineId: "test:x86_64-windows",
            machineIdOverridden: true,
            manifest: { baseUrl: "https://unused.invalid", ref: "main" },
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
        JSON.parse(await readFile(join(stateRoot, "windows.lock.json"), "utf8")).operations[0]
          .action,
      ).toBe("upgrade");
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
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
          noPush: true,
          which: async (command) =>
            command === "winget" ? "C:\\Windows\\winget.exe" : "C:\\scoop\\shims\\scoop.cmd",
          run: async (command, args) => {
            calls.push([command, ...args]);
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
        "update",
      ],
    ]);
  });
});

describe("Windows setup manifest selection", () => {
  test("persists and fetches from a compatible manifest repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-custom-source-"));
    try {
      const fetched: string[] = [];
      await Effect.runPromise(
        runSetup({
          stateRoot: root,
          manifestBaseUrl: "https://raw.githubusercontent.com/acme/workstation-config",
          manifestRef: "work",
          manifestPaths: WINDOWS_SETUP_MANIFEST_PATHS,
          fetcher: async (url) => {
            fetched.push(url);
            return new Response(url.includes("scoop") ? 'package "fzf"\n' : "alchemy\n");
          },
        }),
      );

      expect(fetched).toEqual([
        "https://raw.githubusercontent.com/acme/workstation-config/work/packages/windows/scoop.txt",
      ]);
      expect(JSON.parse(await readFile(join(root, "config.json"), "utf8"))).toMatchObject({
        manifest: {
          baseUrl: "https://raw.githubusercontent.com/acme/workstation-config",
          ref: "work",
        },
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("materializes Scoop without macOS symlink work", async () => {
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
          nextCommand: "Next: outfitting-manager update winget|scoop|all",
        }),
      );
      expect(fetched).toEqual([
        "https://raw.githubusercontent.com/jfalava/outfitting/main/packages/windows/scoop.txt",
      ]);
      await expect(
        readFile(join(root, "manifests/packages/windows/scoop.txt"), "utf8"),
      ).resolves.toBe('package "fzf"\n');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("init prefetches the configured Scoop route", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-init-routes-"));
    try {
      await saveConfigFile(
        {
          windows: {
            wingetProfilePath: "profiles/{profile}.list",
            scoopPath: "manifests/scoop.list",
          },
        },
        { stateRoot: root },
      );
      const fetched: string[] = [];
      await Effect.runPromise(
        runSetup({
          stateRoot: root,
          useWindowsRoutes: true,
          fetcher: async (url) => {
            fetched.push(url);
            return new Response('package "fzf"\n');
          },
        }),
      );
      expect(fetched).toEqual([
        "https://raw.githubusercontent.com/jfalava/outfitting/main/manifests/scoop.list",
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
