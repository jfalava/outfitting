import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import {
  parseWindowsPackageList,
  resolveWindowsProfiles,
  syncWindows,
} from "@/commands/windows-sync";
import type { ManagerConfig } from "@/config";
import type { RunCommandResult } from "@/process";
import { readWindowsLock, writeWindowsLock } from "@/update/windows-lock";

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
  test("deduplicates comma-separated selections and rejects unknown profiles", () => {
    expect(resolveWindowsProfiles(["base,dev", "dev"], [])).toEqual(["base", "dev"]);
    expect(parseWindowsPackageList("Git.Git\ngit.git\n# comment\n", "base.txt")).toEqual([
      "Git.Git",
    ]);
    expect(() => resolveWindowsProfiles(["unknown"], [])).toThrow("Unknown Windows profile(s)");
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
            clean: true,
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

  test("retains old profile packages for a later explicit clean", async () => {
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
        run,
        which: async (command: string) => (command === "winget" ? "C:\\winget.exe" : undefined),
        wingetOnly: true,
      };

      await Effect.runPromise(syncWindows({ ...common, profiles: ["base"] }));
      calls.length = 0;
      await Effect.runPromise(syncWindows({ ...common, profiles: ["dev"] }));
      expect((await readWindowsLock(config)).packages.winget).toEqual([
        {
          name: "Git.Git",
          args: [
            "install",
            "--id",
            "Git.Git",
            "--exact",
            "--accept-source-agreements",
            "--accept-package-agreements",
          ],
          origin: "manual",
        },
        {
          name: "OpenAI.Codex",
          args: [
            "install",
            "--id",
            "OpenAI.Codex",
            "--exact",
            "--accept-source-agreements",
            "--accept-package-agreements",
          ],
          origin: "baseline",
        },
      ]);

      calls.length = 0;
      await Effect.runPromise(syncWindows({ ...common, clean: true }));
      expect(calls.some((call) => call.includes("uninstall") && call.includes("Git.Git"))).toBe(
        true,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("only removes tracked extras with --clean", async () => {
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
          clean: true,
          config,
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
});
