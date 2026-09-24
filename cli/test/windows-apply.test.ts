import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, test } from "vitest";

import { initializeWindows } from "@/commands/setup/windows";
import { applyWindows } from "@/commands/windows-apply";
import type { ManagerConfig } from "@/config";
import type { RunCommandResult } from "@/process";
import { readWindowsLock } from "@/update/windows-lock";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

const ok = (stdout = ""): RunCommandResult => ({ code: 0, stdout, stderr: "" });
const missing = (): RunCommandResult => ({
  code: -1978335212,
  stdout: "",
  stderr: "not installed",
});

describe("Windows BYOR apply", () => {
  test("initializes a local contract and applies only its custom WinGet path", async () => {
    const stateRoot = await tempRoot("outfitting-windows-state-");
    const repo = await tempRoot("outfitting-windows-repo-");
    await mkdir(join(repo, "machine", "apps"), { recursive: true });
    await writeFile(join(repo, "machine", "apps", "desktop.list"), "Acme.Editor\nAcme.Terminal\n");
    await writeFile(
      join(repo, "outfitting.json"),
      `${JSON.stringify({
        schema: 1,
        profiles: {
          workstation: {
            windows: { winget: { manifest: "machine/apps/desktop.list" } },
          },
        },
      })}\n`,
    );

    await Effect.runPromise(initializeWindows({ stateRoot, repo }));
    const config: ManagerConfig = {
      stateRoot,
      machineId: "test:x64-windows",
      machineIdOverridden: true,
    };
    const discovered: string[] = [];
    const installed = new Set<string>();
    const commands: string[][] = [];
    await Effect.runPromise(
      applyWindows({
        config,
        yes: true,
        which: async (manager) => {
          discovered.push(manager);
          return manager === "winget" ? "winget.exe" : undefined;
        },
        run: async (_command, args) => {
          commands.push([...args]);
          if (args[0] === "list") return installed.has(args[2] ?? "") ? ok() : missing();
          if (args[0] === "install") {
            installed.add(args[2] ?? "");
            return ok();
          }
          return ok();
        },
      }),
    );

    expect((await readWindowsLock(config)).profiles).toEqual(["workstation"]);
    expect(
      (await readWindowsLock(config)).packages.winget.map((item) => item.name).toSorted(),
    ).toEqual(["Acme.Editor", "Acme.Terminal"]);
    expect(discovered).toEqual(["winget"]);
    expect(commands.filter((args) => args[0] === "install").map((args) => args[2])).toEqual([
      "Acme.Editor",
      "Acme.Terminal",
    ]);
    await expect(
      readFile(join(stateRoot, "manifests", "packages", "windows", "base.txt"), "utf8"),
    ).rejects.toThrow();
  });

  test("an omitted Scoop declaration skips Scoop detection", async () => {
    const stateRoot = await tempRoot("outfitting-windows-no-scoop-state-");
    const repo = await tempRoot("outfitting-windows-no-scoop-repo-");
    await writeFile(join(repo, "apps.list"), "Acme.Editor\n");
    await writeFile(
      join(repo, "outfitting.json"),
      `${JSON.stringify({
        schema: 1,
        profiles: { work: { windows: { winget: { manifest: "apps.list" } } } },
      })}\n`,
    );
    await Effect.runPromise(initializeWindows({ stateRoot, repo }));
    const discovered: string[] = [];
    await Effect.runPromise(
      applyWindows({
        config: { stateRoot, machineId: "test:x64-windows", machineIdOverridden: true },
        yes: true,
        which: async (manager) => {
          discovered.push(manager);
          return manager;
        },
        run: async (_command, args) => (args[0] === "list" ? ok("installed") : ok()),
      }),
    );

    expect(discovered).toEqual(["winget"]);
  });
});
