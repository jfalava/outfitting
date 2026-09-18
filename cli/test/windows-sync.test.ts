import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Console, Effect } from "effect";
import { describe, expect, test } from "vitest";

import {
  parseWindowsPackageList,
  resolveWindowsProfiles,
  syncWindows,
} from "@/commands/windows-sync";
import type { ManagerConfig } from "@/config";
import type { RunCommandResult } from "@/process";
import { readWindowsLock, recordWindowsOperation, writeWindowsLock } from "@/update/windows-lock";

const configFor = (stateRoot: string): ManagerConfig => ({
  stateRoot,
  machineId: "test:x64-windows",
  machineIdOverridden: true,
  manifest: {
    baseUrl: "https://example.test/outfitting",
    ref: "main",
  },
});

const responseFor = (url: string): Response => {
  if (url.includes("Microsoft.PowerShell_profile.ps1")) {
    return new Response("Set-Alias outfit outfitting-manager\n");
  }
  if (url.endsWith("packages/windows/base.txt")) {
    return new Response("Git.Git\n");
  }
  if (url.endsWith("packages/windows/dev.txt")) {
    return new Response("OpenAI.Codex\n");
  }
  return new Response('package "fzf"\n');
};

describe("Windows profile selection", () => {
  test.each([false, true])(
    "Scoop removals require confirmation (%s) and preserve untracked apps",
    async (confirmed) => {
      const root = await mkdtemp(join(tmpdir(), "outfitting-scoop-sync-"));
      try {
        const config = configFor(root);
        const lock = await readWindowsLock(config);
        lock.packages.scoop = [{ name: "tracked-extra", args: [], origin: "manual" }];
        await writeWindowsLock(lock, { root });
        const calls: string[][] = [];
        await Effect.runPromise(
          syncWindows({
            config,
            noPush: true,
            confirmClean: Effect.succeed(confirmed),
            fetcher: async (url) => responseFor(url),
            which: async (command) => (command === "winget" ? "winget" : "scoop.ps1"),
            run: async (_command, args) => {
              calls.push([...args]);
              return {
                code: 0,
                stderr: "",
                stdout:
                  args.at(-1) === "export"
                    ? JSON.stringify({
                        apps: ["fzf", "tracked-extra", "untracked-extra"].map((Name) => ({
                          Name,
                          Source: "main",
                          Version: "1",
                          Info: "",
                        })),
                        buckets: [],
                      })
                    : "",
              };
            },
          }),
        );
        expect(
          calls.filter((args) => args.includes("uninstall")).map((args) => args.slice(-2)),
        ).toEqual(confirmed ? [["uninstall", "tracked-extra"]] : []);
        if (!confirmed) expect(calls).toEqual([]);
        expect((await readWindowsLock(config)).packages.scoop.map((entry) => entry.name)).toEqual(
          confirmed ? ["fzf"] : ["tracked-extra"],
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  test("deduplicates comma-separated selections and accepts compatible profile names", () => {
    expect(resolveWindowsProfiles(["base,dev", "dev"], [])).toEqual(["base", "dev"]);
    expect(parseWindowsPackageList("Git.Git\ngit.git\n# comment\n", "base.txt")).toEqual([
      { name: "Git.Git" },
    ]);
    expect(() => resolveWindowsProfiles(["../escape"], [])).toThrow(
      "Invalid Windows profile name(s)",
    );
  });

  test("migrates only paired profiles and allows an explicit replacement", () => {
    expect(
      resolveWindowsProfiles(undefined, ["base", "msstore-base", "dev", "msstore-dev"]),
    ).toEqual(["base", "dev"]);
    expect(() => resolveWindowsProfiles(undefined, ["base", "msstore-dev"])).toThrow(
      "Store-only profiles have been removed: msstore-dev",
    );
    expect(resolveWindowsProfiles(["dev"], ["msstore-base"])).toEqual(["dev"]);
  });

  test("rejects saved Store-only selections before fetching or changing state", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-store-only-"));
    try {
      const config = configFor(root);
      const lock = await readWindowsLock(config);
      lock.profiles = ["msstore-base"];
      const path = await writeWindowsLock(lock, { root });
      const before = await readFile(path, "utf8");
      await expect(
        Effect.runPromise(
          syncWindows({
            config,
            noPush: true,
            fetcher: async () => {
              throw new Error("must not fetch");
            },
            run: async () => {
              throw new Error("must not run");
            },
          }),
        ),
      ).rejects.toThrow("Store-only profiles have been removed");
      expect(await readFile(path, "utf8")).toBe(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test.each([false, true])(
    "removes only the tracked Store source after confirmation (%s)",
    async (confirmed) => {
      const root = await mkdtemp(join(tmpdir(), "outfitting-source-clean-"));
      try {
        const config = configFor(root);
        for (const source of ["winget", "msstore"]) {
          await recordWindowsOperation({
            config,
            manager: "winget",
            action: "install",
            name: "Same.ID",
            args: ["--source", source],
            status: "success",
          });
        }
        expect((await readWindowsLock(config)).packages.winget).toHaveLength(2);
        const calls: string[][] = [];
        await Effect.runPromise(
          syncWindows({
            config,
            noPush: true,
            wingetOnly: true,
            profiles: ["base"],
            confirmClean: Effect.succeed(confirmed),
            which: async (name) => (name === "winget" ? "winget" : undefined),
            fetcher: async (url) =>
              url.endsWith("base.txt") ? new Response("Same.ID\n") : responseFor(url),
            run: async (_command, args) => {
              calls.push([...args]);
              return { code: 0, stdout: "", stderr: "" };
            },
          }),
        );
        expect(calls.filter((args) => args[0] === "uninstall")).toEqual(
          confirmed
            ? [
                [
                  "uninstall",
                  "--id",
                  "Same.ID",
                  "--exact",
                  "--source",
                  "msstore",
                  "--accept-source-agreements",
                ],
              ]
            : [],
        );
        const records = (await readWindowsLock(config)).packages.winget;
        expect(records.map((record) => record.args[record.args.indexOf("--source") + 1])).toEqual(
          confirmed ? ["winget"] : ["winget", "msstore"],
        );
        if (!confirmed) expect(calls).toEqual([]);
        await recordWindowsOperation({
          config,
          manager: "winget",
          action: "uninstall",
          name: "same.id",
          args: ["--source", "msstore"],
          status: "success",
        });
        expect(
          (await readWindowsLock(config)).packages.winget.map((record) => record.name),
        ).toEqual(["Same.ID"]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  test.each(["msstore:", "msstore::App", "other:App", "msstore:--id", "msstore:two words"])(
    "rejects malformed source entry %s",
    (entry) => {
      expect(() => parseWindowsPackageList(`# comment\n${entry}\n`, "base.txt")).toThrow(
        `Invalid WinGet manifest entries in base.txt: line 2: ${entry}`,
      );
    },
  );

  test("deduplicates source tags case-insensitively without merging different sources", () => {
    expect(
      parseWindowsPackageList("Same.ID\nMSSTORE:Same.ID\nmsstore:same.id\n", "base.txt"),
    ).toEqual([{ name: "Same.ID" }, { name: "Same.ID", source: "msstore" }]);
  });

  test("migrates paired saved Store profiles without changing package coverage", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-store-migration-"));
    try {
      const config = configFor(root);
      const calls: string[][] = [];
      const saved = await readWindowsLock(config);
      saved.profiles = ["base", "msstore-base"];
      saved.packages.winget = [
        { name: "Store.App", args: ["--source", "msstore"], origin: "baseline" },
      ];
      await writeWindowsLock(saved, { root });
      const fetcher = async (url: string) => {
        expect(url).not.toContain("msstore-");
        if (url.endsWith("packages/windows/base.txt")) {
          return new Response("Regular.Package\nmsstore:Store.App\n");
        }
        return responseFor(url);
      };

      await Effect.runPromise(
        syncWindows({
          config,
          fetcher,
          noPush: true,
          run: async (command, args) => {
            calls.push([command, ...args]);
            return { code: 0, stdout: "", stderr: "" };
          },
          which: async (command) => (command === "winget" ? "C:\\winget.exe" : undefined),
          wingetOnly: true,
        }),
      );

      expect(calls).toEqual([
        [
          "C:\\winget.exe",
          "install",
          "--id",
          "Regular.Package",
          "--exact",
          "--source",
          "winget",
          "--accept-source-agreements",
          "--accept-package-agreements",
        ],
        [
          "C:\\winget.exe",
          "install",
          "--id",
          "Store.App",
          "--exact",
          "--source",
          "msstore",
          "--accept-source-agreements",
          "--accept-package-agreements",
        ],
      ]);
      expect((await readWindowsLock(config)).profiles).toEqual(["base"]);
      expect((await readWindowsLock(config)).packages.winget.map((entry) => entry.name)).toEqual([
        "Regular.Package",
        "Store.App",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("persists selected profiles and reuses them when --profile is omitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-sync-"));
    try {
      const config = configFor(root);
      const fetched: string[] = [];
      const calls: string[] = [];
      const fetcher = async (url: string) => {
        fetched.push(url);
        return responseFor(url);
      };
      const run = async (
        command: string,
        args: ReadonlyArray<string>,
      ): Promise<RunCommandResult> => {
        calls.push(`${command} ${args.join(" ")}`);
        return { code: 0, stdout: "", stderr: "" };
      };

      await Effect.runPromise(
        syncWindows({
          config,
          fetcher,
          noPush: true,
          profiles: ["base,dev"],
          run,
          which: async (command) => (command === "winget" ? "C:\\winget.exe" : undefined),
          wingetOnly: true,
        }),
      );
      const first = await readWindowsLock(config);
      expect(first.profiles).toEqual(["base", "dev"]);
      expect(first.packages.winget.map((entry) => entry.name)).toEqual(["Git.Git", "OpenAI.Codex"]);
      expect(
        await readFile(
          join(root, "manifests", "dotfiles", "Microsoft.PowerShell_profile.ps1"),
          "utf8",
        ),
      ).toContain("outfitting-manager");

      fetched.length = 0;
      calls.length = 0;
      await Effect.runPromise(
        syncWindows({
          config,
          fetcher,
          noPush: true,
          run,
          which: async (command) => (command === "winget" ? "C:\\winget.exe" : undefined),
          wingetOnly: true,
        }),
      );
      expect(
        fetched
          .filter((url) => url.includes("packages/windows/"))
          .map((url) => url.split("/").at(-1)),
      ).toEqual(["base.txt", "dev.txt"]);
      expect(calls).toHaveLength(2);
      expect((await readWindowsLock(config)).profiles).toEqual(["base", "dev"]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("uses repository-defined Windows routes and default profiles", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-custom-routes-"));
    try {
      const config: ManagerConfig = {
        ...configFor(root),
        windows: {
          wingetProfilePath: "profiles/{profile}.list",
          scoopPath: "manifests/scoop.list",
          powershellProfilePath: "dotfiles/powershell/profile.ps1",
          fontListPath: "fonts/public.list",
          registryPath: "windows/registry",
          defaultProfiles: ["work-laptop"],
        },
      };
      const fetched: string[] = [];
      await Effect.runPromise(
        syncWindows({
          config,
          fetcher: async (url) => {
            fetched.push(url);
            return new Response(
              url.endsWith("profile.ps1") ? "Set-Alias outfit outfitting-manager\n" : "Git.Git\n",
            );
          },
          noPush: true,
          run: async () => ({ code: 0, stdout: "", stderr: "" }),
          which: async (command) => (command === "winget" ? "C:\\winget.exe" : undefined),
          wingetOnly: true,
        }),
      );

      expect(fetched).toEqual([
        "https://example.test/outfitting/main/dotfiles/powershell/profile.ps1",
        "https://example.test/outfitting/main/profiles/work-laptop.list",
      ]);
      expect(
        await readFile(join(root, "manifests", "dotfiles", "powershell", "profile.ps1"), "utf8"),
      ).toContain("outfitting-manager");
      expect((await readWindowsLock(config)).profiles).toEqual(["work-laptop"]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test.each([43, -1978335189])(
    "treats WinGet exit %s as an already-installed package",
    async (code) => {
      const root = await mkdtemp(join(tmpdir(), "outfitting-windows-sync-"));
      try {
        const config = configFor(root);
        await Effect.runPromise(
          syncWindows({
            config,
            fetcher: async (url) => responseFor(url),
            noPush: true,
            run: async () => ({ code, stdout: "", stderr: "already installed" }),
            which: async (command) => (command === "winget" ? "C:\\winget.exe" : undefined),
            wingetOnly: true,
          }),
        );
        const lock = await readWindowsLock(config);
        expect(lock.profiles).toEqual(["base"]);
        expect(lock.packages.winget.map((entry) => entry.name)).toEqual(["Git.Git"]);
        expect(lock.operations.at(-1)).toMatchObject({ status: "success", exitCode: code });
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    },
  );

  test.each([
    { action: "install", code: 1 },
    { action: "uninstall", code: 43 },
  ])("rejects WinGet $action exit $code", async ({ action, code }) => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-sync-"));
    try {
      const config = configFor(root);
      const lock = await readWindowsLock(config);
      lock.packages.winget = [{ name: "Old.Package", args: [], origin: "baseline" }];
      await writeWindowsLock(lock, { root });
      await expect(
        Effect.runPromise(
          syncWindows({
            config,
            confirmClean: Effect.succeed(true),
            fetcher: async (url) => responseFor(url),
            noPush: true,
            run: async (_command, args) => ({
              code: args[0] === action ? code : 0,
              stdout: "",
              stderr: "failure",
            }),
            which: async (command) => (command === "winget" ? "C:\\winget.exe" : undefined),
            wingetOnly: true,
          }),
        ),
      ).rejects.toThrow(`failed (exit ${code})`);
      expect((await readWindowsLock(config)).profiles).toEqual([]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("removes old profile packages after confirmation", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-sync-"));
    try {
      const config = configFor(root);
      const calls: string[] = [];
      const run = async (
        command: string,
        args: ReadonlyArray<string>,
      ): Promise<RunCommandResult> => {
        calls.push(`${command} ${args.join(" ")}`);
        return { code: 0, stdout: "", stderr: "" };
      };
      const common = {
        config,
        fetcher: async (url: string) => responseFor(url),
        noPush: true,
        confirmClean: Effect.succeed(true),
        run,
        which: async (command: string) => (command === "winget" ? "C:\\winget.exe" : undefined),
        wingetOnly: true,
      };

      await Effect.runPromise(syncWindows({ ...common, profiles: ["base"] }));
      calls.length = 0;
      await Effect.runPromise(syncWindows({ ...common, profiles: ["dev"] }));
      expect((await readWindowsLock(config)).packages.winget.map((entry) => entry.name)).toEqual([
        "OpenAI.Codex",
      ]);
      expect(calls.filter((call) => call.includes("uninstall"))).toEqual([
        "C:\\winget.exe uninstall --id Git.Git --exact --source winget --accept-source-agreements",
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("only removes tracked extras", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-sync-"));
    try {
      const config = configFor(root);
      const lock = await readWindowsLock(config);
      await writeWindowsLock(
        {
          ...lock,
          packages: {
            ...lock.packages,
            winget: [
              {
                name: "Old.Package",
                args: ["install", "--id", "Old.Package"],
                origin: "baseline",
              },
            ],
          },
        },
        { root },
      );
      const calls: string[] = [];
      await Effect.runPromise(
        syncWindows({
          config,
          confirmClean: Effect.succeed(true),
          fetcher: async (url) => responseFor(url),
          noPush: true,
          run: async (command, args) => {
            calls.push(`${command} ${args.join(" ")}`);
            return { code: 0, stdout: "", stderr: "" };
          },
          which: async (command) => (command === "winget" ? "C:\\winget.exe" : undefined),
          wingetOnly: true,
        }),
      );
      expect(calls.some((call) => call.includes("uninstall") && call.includes("Old.Package"))).toBe(
        true,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("lists clean candidates and aborts before package operations", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-windows-sync-"));
    try {
      const config = configFor(root);
      const lock = await readWindowsLock(config);
      lock.packages.winget = [{ name: "Old.Package", args: [], origin: "baseline" }];
      await writeWindowsLock(lock, { root });

      const calls: string[] = [];
      const output: string[] = [];
      const testConsole = Object.assign(Object.create(console), {
        log: (...args: ReadonlyArray<unknown>) => output.push(args.join(" ")),
      }) as Console.Console;
      await Effect.runPromise(
        syncWindows({
          config,
          confirmClean: Effect.succeed(false),
          fetcher: async (url) => responseFor(url),
          noPush: true,
          run: async (command, args) => {
            calls.push(`${command} ${args.join(" ")}`);
            return { code: 0, stdout: "", stderr: "" };
          },
          which: async (command) => (command === "winget" ? "C:\\winget.exe" : undefined),
          wingetOnly: true,
        }).pipe(Effect.provideService(Console.Console, testConsole)),
      );

      expect(output.join("\n")).toContain("WinGet: winget:Old.Package");
      expect(output.join("\n")).toContain("Aborted. No packages were removed.");
      expect(calls).toEqual([]);
      expect((await readWindowsLock(config)).packages.winget.map((entry) => entry.name)).toEqual([
        "Old.Package",
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
