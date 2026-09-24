import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, expect, test, vi } from "vitest";

import type { ManagerConfig } from "@/config";
import { pushLockfile } from "@/lockfiles";
import { updateWindowsAll } from "@/update/windows-all";
import { readWindowsLock, writeWindowsLock, type WindowsLock } from "@/update/windows-lock";

vi.mock("@/lockfiles", () => ({ pushLockfile: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

test.each([
  { wingetCode: 0, scoopCode: 0, noPush: false },
  { wingetCode: 1, scoopCode: 0, noPush: false },
  { wingetCode: 0, scoopCode: 1, noPush: false },
  { wingetCode: 0, scoopCode: 0, noPush: true },
])(
  "update all preserves package ownership while recording upgrades: %j",
  async ({ wingetCode, scoopCode, noPush }) => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-update-all-"));
    try {
      const config: ManagerConfig = {
        stateRoot: root,
        machineId: "test:x64-windows",
        machineIdOverridden: true,
      };
      const before = await readWindowsLock(config);
      before.profiles = ["dev"];
      before.packages.winget = [{ name: "Git.Git", args: [], origin: "manual" }];
      before.packages.scoop = [{ name: "old", args: [], origin: "baseline" }];
      await writeWindowsLock(before, { root });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const pushed: WindowsLock[] = [];
      vi.mocked(pushLockfile).mockImplementation(({ path }) =>
        Effect.promise(async () => {
          pushed.push(JSON.parse(await readFile(path!, "utf8")) as WindowsLock);
          return undefined;
        }),
      );
      const calls: string[][] = [];
      const result = Effect.runPromise(
        updateWindowsAll({
          config,
          noPush,
          which: async (command) => (command === "winget" ? "winget" : "scoop.ps1"),
          run: async (command, args) => {
            calls.push([...args]);
            return {
              code: command === "winget" ? wingetCode : scoopCode,
              stderr: "simulated failure",
              stdout:
                args.at(-1) === "export"
                  ? JSON.stringify({
                      apps: [{ Name: "old", Source: "main", Version: "1", Info: "" }],
                      buckets: [],
                    })
                  : "",
            };
          },
        }),
      );
      if (wingetCode || scoopCode) await expect(result).rejects.toThrow("failed step");
      else await result;
      const local = await readWindowsLock(config);
      expect(local.packages.scoop).toEqual(before.packages.scoop);
      expect(local.profiles).toEqual(["dev"]);
      expect(local.packages.winget).toEqual(before.packages.winget);
      expect(calls.some((args) => args.includes("uninstall"))).toBe(false);
      expect(calls.some((args) => args.includes("install"))).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      if (noPush) {
        expect(pushed).toEqual([]);
      } else {
        expect(pushed).toEqual([
          expect.objectContaining({
            profiles: ["dev"],
            packages: expect.objectContaining({
              winget: before.packages.winget,
              scoop: before.packages.scoop,
            }),
          }),
        ]);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  },
);
