import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, test } from "vitest";

import { initializeWindows } from "@/commands/setup/windows";
import { applyWindows } from "@/commands/windows-apply";
import { loadConfig } from "@/config";
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
  test("Windows setup accepts composed profiles alongside unrelated Linux declarations", async () => {
    const stateRoot = await tempRoot("outfitting-windows-mixed-state-");
    const repo = await tempRoot("outfitting-windows-mixed-repo-");
    await writeFile(join(repo, "work.list"), "Acme.Editor\n");
    await writeFile(join(repo, "dev.list"), "Acme.Terminal\n");
    await writeFile(join(repo, "linux.list"), "curl\n");
    await writeFile(
      join(stateRoot, "config.toml"),
      [
        "schema = 1",
        "",
        "[source]",
        `path = ${JSON.stringify(repo)}`,
        "",
        "[windows]",
        'profiles = ["work", "dev"]',
        "",
        "[profiles.work.windows.winget]",
        'manifest = "work.list"',
        "",
        "[profiles.dev.windows.winget]",
        'manifest = "dev.list"',
        "",
        "[profiles.linux-home.linux.apt]",
        'manifest = "linux.list"',
        "",
      ].join("\n"),
    );

    const { repo: validated } = await Effect.runPromise(
      initializeWindows({ stateRoot, profiles: ["work", "dev"] }),
    );

    expect(validated.root).toBe(repo);
    expect(validated.flakeKind).toBe("none");
  });

  test("initializes a local contract and applies only its custom WinGet path", async () => {
    const stateRoot = await tempRoot("outfitting-windows-state-");
    const repo = await tempRoot("outfitting-windows-repo-");
    await mkdir(join(repo, "machine", "apps"), { recursive: true });
    await writeFile(join(repo, "machine", "apps", "desktop.list"), "Acme.Editor\nAcme.Terminal\n");
    await writeFile(
      join(stateRoot, "config.toml"),
      `schema = 1\n[source]\npath = ${JSON.stringify(repo)}\n[windows]\nprofiles = ["workstation"]\n[profiles.workstation.windows.winget]\nmanifest = "machine/apps/desktop.list"\n`,
    );

    const config = await loadConfig({ stateRoot, machineId: "test:x64-windows" });
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
      join(stateRoot, "config.toml"),
      `schema = 1\n[source]\npath = ${JSON.stringify(repo)}\n[windows]\nprofiles = ["work"]\n[profiles.work.windows.winget]\nmanifest = "apps.list"\n`,
    );
    const config = await loadConfig({ stateRoot, machineId: "test:x64-windows" });
    const discovered: string[] = [];
    await Effect.runPromise(
      applyWindows({
        config,
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

  test("a failed install leaves the previously applied profiles unchanged", async () => {
    const stateRoot = await tempRoot("outfitting-windows-failed-state-");
    const repo = await tempRoot("outfitting-windows-failed-repo-");
    await writeFile(join(repo, "apps.list"), "Acme.Editor\n");
    await writeFile(
      join(stateRoot, "config.toml"),
      `schema = 1\n[source]\npath = ${JSON.stringify(repo)}\n[windows]\nprofiles = ["work"]\n[profiles.work.windows.winget]\nmanifest = "apps.list"\n`,
    );
    const config = await loadConfig({ stateRoot });
    await expect(
      Effect.runPromise(
        applyWindows({
          config,
          yes: true,
          which: async () => "winget.exe",
          run: async (_command, args) =>
            args[0] === "list" ? missing() : { code: 1, stdout: "", stderr: "failed" },
        }),
      ),
    ).rejects.toThrow();
    expect((await readWindowsLock(config)).profiles).toEqual([]);
  });
});
