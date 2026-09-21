import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Console, Effect } from "effect";
import { afterEach, describe, expect, test, vi } from "vitest";

import { initializeWindows } from "@/commands/setup/windows";
import { applyWindows } from "@/commands/windows-apply";
import type { ManagerConfig } from "@/config";
import { fetchManifest } from "@/fetch";
import { pushLockfile } from "@/lockfiles";
import type { RunCommandResult } from "@/process";
import * as processCommands from "@/process";
import { readWindowsLock, writeWindowsLock } from "@/update/windows-lock";

vi.mock("@/lockfiles", () => ({ pushLockfile: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

const configFor = (stateRoot: string): ManagerConfig => ({
  stateRoot,
  machineId: "test:x64-windows",
  machineIdOverridden: true,
  manifest: { baseUrl: "https://example.test/outfitting", ref: "main" },
});

const ok = (stdout = ""): RunCommandResult => ({ code: 0, stdout, stderr: "" });
const missing = (): RunCommandResult => ({
  code: -1978335212,
  stdout: "",
  stderr: "not installed",
});

async function seed(
  config: ManagerConfig,
  manifests: { base?: string; dev?: string; scoop?: string } = {},
) {
  const bodies = {
    "packages/windows/base.txt": manifests.base ?? "Git.Git\n",
    "packages/windows/dev.txt": manifests.dev ?? "OpenAI.Codex\n",
    "packages/windows/scoop.txt": manifests.scoop ?? 'package "fzf"\n',
    "dotfiles/Microsoft.PowerShell_profile.ps1": "profile\n",
  };
  for (const [path, body] of Object.entries(bodies)) {
    await fetchManifest({ path, config, fetcher: async () => new Response(body) });
  }
}

describe("Windows apply", () => {
  test("init materializes composable profiles without running package managers", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-init-windows-"));
    try {
      const run = vi
        .spyOn(processCommands, "runCommand")
        .mockRejectedValue(new Error("no package changes during init"));
      const fetcher = vi.fn(
        async (url: string) =>
          new Response(url.includes("scoop") ? 'package "fzf"\n' : "prepared\n"),
      );
      await Effect.runPromise(
        initializeWindows({
          stateRoot: root,
          profiles: ["base,dev"],
          manifestBaseUrl: "https://example.test/outfitting",
          fetcher,
        }),
      );
      expect((await readWindowsLock(configFor(root))).profiles).toEqual(["base", "dev"]);
      for (const path of [
        "packages/windows/base.txt",
        "packages/windows/dev.txt",
        "dotfiles/Microsoft.PowerShell_profile.ps1",
      ]) {
        expect(await readFile(join(root, "manifests", path), "utf8")).toBe("prepared\n");
      }
      expect(run).not.toHaveBeenCalled();
      expect(pushLockfile).not.toHaveBeenCalled();
      fetcher.mockClear();
      await Effect.runPromise(
        initializeWindows({ stateRoot: root, fetchManifests: false, fetcher }),
      );
      expect(fetcher).not.toHaveBeenCalled();
      expect((await readWindowsLock(configFor(root))).profiles).toEqual(["base", "dev"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("preserves preinstalled packages and never uses remote declarations", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-apply-preinstalled-"));
    try {
      const config = configFor(root);
      await seed(config);
      const calls: string[][] = [];
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("remote fetch forbidden"));
      await Effect.runPromise(
        applyWindows({
          config,
          wingetOnly: true,
          yes: true,
          which: async (name) => (name === "winget" ? "winget" : undefined),
          run: async (_command, args) => {
            calls.push([...args]);
            return ok();
          },
        }),
      );
      expect(calls.every((args) => args[0] === "list")).toBe(true);
      expect((await readWindowsLock(config)).packages.winget).toEqual([]);
      expect(pushLockfile).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("bare apply preserves stale tracking; prune removes only proven active-only ownership", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-apply-prune-"));
    try {
      const config = configFor(root);
      await seed(config);
      const lock = await readWindowsLock(config);
      lock.profiles = ["base"];
      lock.packages.winget = [
        {
          name: "Active.Old",
          args: [],
          origin: "baseline",
          installedBy: "outfitting",
          owners: ["base"],
        },
        {
          name: "Inactive.Old",
          args: [],
          origin: "baseline",
          installedBy: "outfitting",
          owners: ["dev"],
        },
        {
          name: "Shared.Old",
          args: [],
          origin: "baseline",
          installedBy: "outfitting",
          owners: ["base", "dev"],
        },
        { name: "Legacy.Old", args: [], origin: "baseline" },
      ];
      await writeWindowsLock(lock, { root });
      const calls: string[][] = [];
      const run = async (_command: string, args: ReadonlyArray<string>) => {
        calls.push([...args]);
        return args[0] === "list" ? ok() : ok();
      };
      const common = { config, wingetOnly: true, yes: true, run, which: async () => "winget" };
      await Effect.runPromise(applyWindows(common));
      expect(calls.some((args) => args[0] === "uninstall")).toBe(false);
      expect((await readWindowsLock(config)).packages.winget).toHaveLength(4);

      calls.length = 0;
      await Effect.runPromise(applyWindows({ ...common, prune: true }));
      expect(calls.filter((args) => args[0] === "uninstall").map((args) => args[2])).toEqual([
        "Active.Old",
      ]);
      expect((await readWindowsLock(config)).packages.winget.map((entry) => entry.name)).toEqual([
        "Inactive.Old",
        "Legacy.Old",
        "Shared.Old",
      ]);
      expect(
        (await readWindowsLock(config)).packages.winget.find((entry) => entry.name === "Shared.Old")
          ?.owners,
      ).toEqual(["dev"]);

      calls.length = 0;
      await Effect.runPromise(applyWindows({ ...common, profiles: ["dev"], prune: true }));
      expect(calls.filter((args) => args[0] === "uninstall").map((args) => args[2])).toEqual([
        "Inactive.Old",
        "Shared.Old",
      ]);
      expect((await readWindowsLock(config)).packages.winget.map((entry) => entry.name)).toEqual([
        "Legacy.Old",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("displays the plan before confirmation denial and makes no changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-apply-denied-"));
    try {
      const config = configFor(root);
      await seed(config);
      const calls: string[][] = [];
      const output: string[] = [];
      const testConsole = Object.assign(Object.create(console), {
        log: (...args: ReadonlyArray<unknown>) => output.push(args.join(" ")),
      }) as Console.Console;
      await Effect.runPromise(
        applyWindows({
          config,
          wingetOnly: true,
          confirm: Effect.succeed(false),
          which: async () => "winget",
          run: async (_command, args) => {
            calls.push([...args]);
            return args[0] === "list" ? missing() : ok();
          },
        }).pipe(Effect.provideService(Console.Console, testConsole)),
      );
      expect(output.join("\n")).toContain("install WinGet: winget:Git.Git");
      expect(output.join("\n")).toContain("Aborted");
      expect(calls.map((args) => args[0])).toEqual(["list"]);
      expect((await readWindowsLock(config)).packages.winget).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("persists proven ownership for successful installs before a later failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-apply-partial-"));
    try {
      const config = configFor(root);
      await seed(config, { base: "First.Package\nSecond.Package\n" });
      await expect(
        Effect.runPromise(
          applyWindows({
            config,
            wingetOnly: true,
            yes: true,
            which: async () => "winget",
            run: async (_command, args) => {
              if (args[0] === "list") return missing();
              return args[2] === "Second.Package" ? { ...missing(), stderr: "failed" } : ok();
            },
          }),
        ),
      ).rejects.toThrow("Second.Package failed");
      const lock = await readWindowsLock(config);
      expect(lock.packages.winget).toEqual([
        expect.objectContaining({
          name: "First.Package",
          origin: "baseline",
          installedBy: "outfitting",
          owners: ["base"],
        }),
      ]);
      expect(lock.operations.at(-1)).toMatchObject({ name: "Second.Package", status: "failed" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("--winget-only skips Scoop discovery and commands even when Scoop is installed", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-apply-winget-only-"));
    try {
      const config = configFor(root);
      await seed(config);
      const discovered: string[] = [];
      await Effect.runPromise(
        applyWindows({
          config,
          wingetOnly: true,
          yes: true,
          which: async (name) => {
            discovered.push(name);
            return name;
          },
          run: async (_command, args) => (args[0] === "list" ? ok() : ok()),
        }),
      );
      expect(discovered).toEqual(["winget"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("inventory errors abort instead of installing or claiming ownership", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-apply-inventory-error-"));
    try {
      const config = configFor(root);
      await seed(config);
      const run = vi.fn(async () => ({ code: 1, stdout: "", stderr: "source unavailable" }));
      await expect(
        Effect.runPromise(
          applyWindows({ config, yes: true, wingetOnly: true, which: async () => "winget", run }),
        ),
      ).rejects.toThrow("source unavailable");
      expect(run).toHaveBeenCalledTimes(1);
      await expect(readFile(join(root, "windows.lock.json"), "utf8")).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("local declarations override cache and shared ownership survives a later installation failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-apply-shared-"));
    try {
      const config = configFor(root);
      await seed(config);
      const lock = await readWindowsLock(config);
      lock.packages.winget = [
        {
          name: "Shared.App",
          args: [],
          origin: "baseline",
          installedBy: "outfitting",
          owners: ["base"],
        },
      ];
      await writeWindowsLock(lock, { root });
      await mkdir(join(root, "manifests/packages/windows"), { recursive: true });
      await writeFile(join(root, "manifests/packages/windows/dev.txt"), "Shared.App\nFail.App\n");
      const calls: string[][] = [];
      await expect(
        Effect.runPromise(
          applyWindows({
            config,
            profiles: ["dev"],
            yes: true,
            wingetOnly: true,
            which: async () => "winget",
            run: async (_command, args) => {
              calls.push([...args]);
              if (args[0] === "list") return args[2] === "Shared.App" ? ok() : missing();
              return { code: 1, stdout: "", stderr: "install failed" };
            },
          }),
        ),
      ).rejects.toThrow("Fail.App failed");
      const after = await readWindowsLock(config);
      expect(after.profiles).toEqual(["dev"]);
      expect(after.packages.winget[0]?.owners).toEqual(["base", "dev"]);
      expect(calls.some((args) => args.includes("OpenAI.Codex"))).toBe(false);
      expect(calls.at(-1)).toContain("--no-upgrade");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("global Scoop packages remain unowned and an empty declaration can prune owned WinGet packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-apply-global-"));
    try {
      const config = configFor(root);
      await seed(config, { base: "", scoop: 'package "fzf"\n' });
      const lock = await readWindowsLock(config);
      lock.packages.winget = [
        {
          name: "Old.App",
          args: [],
          origin: "baseline",
          installedBy: "outfitting",
          owners: ["base"],
        },
      ];
      await writeWindowsLock(lock, { root });
      const calls: string[][] = [];
      await Effect.runPromise(
        applyWindows({
          config,
          yes: true,
          prune: true,
          which: async (name) => name,
          run: async (_command, args) => {
            calls.push([...args]);
            return args.at(-1) === "export"
              ? ok(
                  JSON.stringify({
                    apps: [{ Name: "fzf", Version: "1", Source: "main", Info: "Global install" }],
                    buckets: [],
                  }),
                )
              : ok();
          },
        }),
      );
      expect(calls.some((args) => args.includes("install"))).toBe(false);
      const after = await readWindowsLock(config);
      expect(after.packages.winget).toEqual([]);
      expect(after.packages.scoop).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("apply reads winget from a local BYOR checkout without default monorepo layout", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-byor-apply-state-"));
    const repo = await mkdtemp(join(tmpdir(), "outfitting-byor-apply-repo-"));
    try {
      await mkdir(join(repo, "machine", "winget"), { recursive: true });
      await writeFile(join(repo, "machine", "winget", "core.txt"), "Git.Git\nMicrosoft.WindowsTerminal\n");
      await writeFile(
        join(repo, "outfitting.json"),
        `${JSON.stringify({
          schema: 1,
          windows: { defaultProfiles: ["core"] },
          profiles: {
            core: { windows: { winget: { manifest: "machine/winget/core.txt" } } },
          },
        })}\n`,
      );
      await writeFile(join(stateRoot, "repo-path"), `${repo}\n`);

      const config = configFor(stateRoot);
      const installed = new Set<string>();
      await Effect.runPromise(
        applyWindows({
          config,
          profiles: ["core"],
          wingetOnly: true,
          yes: true,
          which: async (name) => name,
          run: async (_command, args) => {
            if (args[0] === "list") {
              return installed.has(args[2] ?? "") ? ok("Name Id\nGit Git.Git") : missing();
            }
            if (args[0] === "install") {
              installed.add(args[2] ?? "");
              return ok();
            }
            return ok();
          },
        }),
      );

      const lock = await readWindowsLock(config);
      expect(lock.profiles).toEqual(["core"]);
      expect(lock.packages.winget.map((entry) => entry.name).toSorted()).toEqual([
        "Git.Git",
        "Microsoft.WindowsTerminal",
      ]);
      // Default monorepo path must not be required.
      await expect(
        readFile(join(stateRoot, "manifests", "packages", "windows", "core.txt"), "utf8"),
      ).rejects.toThrow();
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });
});
