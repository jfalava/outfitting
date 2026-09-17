import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  collectDiff,
  parseWingetExport,
  type CollectDiffOptions,
  type DiffProgress,
} from "@/diff/compare";
import { hasDifferences } from "@/diff/types";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { type runCommand, type RunCommandResult } from "@/process";
import { parseBrewfileManifest } from "@/update/brew";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

function config(stateRoot: string) {
  return {
    stateRoot,
    machineId: "test:x64-windows",
    machineIdOverridden: true,
    manifest: {
      baseUrl: "https://example.test/outfitting",
      ref: "test",
    },
  };
}

const ok = (stdout = ""): RunCommandResult => ({ code: 0, stdout, stderr: "" });

describe("diff parsers", () => {
  test("parses Homebrew entries without treating unrelated Brewfile records as formulae", () => {
    expect(
      parseBrewfileManifest(`
tap "cloudflare/cloudflare", trusted: true
brew "jq"
brew "jq"
cask "Firefox"
package "not-homebrew"
`),
    ).toEqual({
      taps: ["cloudflare/cloudflare"],
      formulae: ["jq"],
      casks: ["Firefox"],
    });
  });

  test("parses WinGet exports through the package source schema", () => {
    expect(
      parseWingetExport(
        JSON.stringify({
          Sources: [
            {
              Packages: [
                { PackageIdentifier: "zeta.App", Version: "1" },
                { PackageIdentifier: "alpha.App", Version: "2" },
              ],
            },
          ],
        }),
      ),
    ).toEqual(["alpha.App", "zeta.App"]);
    expect(() => parseWingetExport("{}")).toThrow(/valid package sources/);
  });
});

describe("collectDiff", () => {
  test("compares Homebrew direct state without invoking mutating commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-diff-brew-"));
    roots.push(root);
    const calls: string[] = [];
    const progress: DiffProgress[] = [];
    const trace: string[] = [];
    const result = await collectDiff({
      platform: "macos",
      manager: "brew",
      config: config(root),
      onProgress: (event) => {
        progress.push(event);
        trace.push(`progress:${event.phase}`);
      },
      which: async () => "brew",
      fetcher: async () => new Response('tap "cloudflare/cloudflare"\nbrew "jq"\ncask "Firefox"\n'),
      run: async (command, args) => {
        trace.push("run");
        calls.push(`${command} ${args.join(" ")}`);
        if (args[0] === "tap") return ok("cloudflare/cloudflare\n");
        if (args.includes("--formula")) return ok("jq\n");
        return ok("Firefox\n");
      },
    });

    expect(result.differences).toBe(false);
    expect(result.sections[0]).toMatchObject({ manager: "brew", status: "same" });
    expect(calls).toEqual([
      "brew tap",
      "brew list --formula",
      "brew list --cask",
      "brew list --formula --installed-on-request",
    ]);
    expect(progress).toEqual([
      { completed: 0, total: 1, manager: "brew", phase: "started" },
      {
        completed: 0,
        total: 1,
        manager: "brew",
        phase: "item",
        item: "tap: cloudflare/cloudflare",
        itemIndex: 1,
        itemTotal: 3,
      },
      {
        completed: 0,
        total: 1,
        manager: "brew",
        phase: "item",
        item: "formula: jq",
        itemIndex: 2,
        itemTotal: 3,
      },
      {
        completed: 0,
        total: 1,
        manager: "brew",
        phase: "item",
        item: "cask: Firefox",
        itemIndex: 3,
        itemTotal: 3,
      },
      { completed: 1, total: 1, manager: "brew", phase: "completed" },
    ]);
    expect(trace[0]).toBe("progress:started");
    expect(trace.at(-1)).toBe("progress:completed");
  });

  test("counts required dependencies as present and excludes unrequested extras", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-diff-brew-"));
    roots.push(root);
    const result = await collectDiff({
      platform: "macos",
      manager: "brew",
      config: config(root),
      which: async () => "brew",
      fetcher: async () => new Response('brew "jq"\nbrew "oniguruma"\nbrew "missing"\n'),
      run: async (_command, args) => {
        // jq is explicitly installed but also used by another formula.
        // oniguruma was installed as a dependency but is now required by the manifest.
        // orphan is a leaf installed as a dependency, not an explicit extra.
        if (args[0] === "leaves") return ok("extra\norphan\n");
        if (args.includes("--installed-on-request")) return ok("jq\nextra\n");
        if (args.includes("--formula")) return ok("jq\noniguruma\nextra\norphan\n");
        return ok();
      },
    });
    expect(result.sections[0]).toMatchObject({
      status: "different",
      missing: ["formula: missing"],
      extra: ["formula: extra"],
      changed: [],
    });
  });

  test("compares WinGet export state and reports missing and extra packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-diff-winget-"));
    roots.push(root);
    const calls: string[] = [];
    const progress: DiffProgress[] = [];
    const result = await collectDiff({
      platform: "windows",
      manager: "winget",
      config: config(root),
      onProgress: (event) => progress.push(event),
      which: async () => "winget.exe",
      fetcher: async () => new Response("Git.Git\nOven-sh.Bun\n"),
      run: async (command, args) => {
        calls.push(`${command} ${args.join(" ")}`);
        await writeFile(
          String(args[2]),
          JSON.stringify({
            Sources: [
              { Packages: [{ PackageIdentifier: "git.git" }, { PackageIdentifier: "Extra.App" }] },
            ],
          }),
        );
        return ok();
      },
    });

    expect(result.sections[0]).toMatchObject({
      manager: "winget",
      status: "different",
      missing: ["Oven-sh.Bun"],
      extra: ["Extra.App"],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/export/);
    expect(progress).toEqual([
      { completed: 0, total: 1, manager: "winget", phase: "started" },
      {
        completed: 0,
        total: 1,
        manager: "winget",
        phase: "item",
        item: "Git.Git",
        itemIndex: 1,
        itemTotal: 3,
      },
      {
        completed: 0,
        total: 1,
        manager: "winget",
        phase: "item",
        item: "Oven-sh.Bun",
        itemIndex: 2,
        itemTotal: 3,
      },
      {
        completed: 0,
        total: 1,
        manager: "winget",
        phase: "item",
        item: "Extra.App",
        itemIndex: 3,
        itemTotal: 3,
      },
      { completed: 1, total: 1, manager: "winget", phase: "completed" },
    ]);
  });
});

const manifestCases: ReadonlyArray<{
  platform: CollectDiffOptions["platform"];
  manager: string;
  path: string;
  body: string;
}> = [
  { platform: "macos", manager: "brew", path: "packages/macos/Brewfile", body: 'brew "jq"\n' },
  { platform: "windows", manager: "winget", path: "packages/windows/base.txt", body: "Git.Git\n" },
  {
    platform: "windows",
    manager: "scoop",
    path: "packages/windows/scoop.txt",
    body: 'package "jq"\n',
  },
];

const matchingInventory: typeof runCommand = async (_command, args) => {
  if (args.includes("export")) {
    if (args[1] === "--output") {
      await writeFile(
        String(args[2]),
        JSON.stringify({ Sources: [{ Packages: [{ PackageIdentifier: "Git.Git" }] }] }),
      );
      return ok();
    }
    return ok(JSON.stringify({ apps: [{ Name: "jq", Version: "1", Info: "" }], buckets: [] }));
  }
  return ok(args.includes("--formula") ? "jq\n" : "");
};

describe.each(manifestCases)("$manager manifest freshness", ({ platform, manager, path, body }) => {
  test.each(["network", "http"])("rejects cached fallback after a %s failure", async (failure) => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-diff-cache-"));
    roots.push(root);
    const managerConfig = config(root);
    await fetchManifest({ path, config: managerConfig, fetcher: async () => new Response(body) });
    const run = vi.fn<typeof runCommand>();
    const result = await collectDiff({
      platform,
      manager,
      profiles: ["base"],
      config: managerConfig,
      which: async () => manager,
      run,
      fetcher: async () => {
        if (failure === "network") throw new Error("network down");
        return new Response("unavailable", { status: 503 });
      },
    });
    expect(result.unavailable).toBe(true);
    expect(hasDifferences(result)).toBe(true);
    expect(result.sections[0]).toMatchObject({
      status: "unavailable",
      message: expect.stringMatching(/cached manifest.*Fresh repository state.*--offline/),
    });
    expect(run).not.toHaveBeenCalled();
  });

  test("allows explicit offline comparison and exposes cached provenance", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-diff-cache-"));
    roots.push(root);
    const managerConfig = config(root);
    await fetchManifest({ path, config: managerConfig, fetcher: async () => new Response(body) });
    const fetcher = vi.fn<ManifestFetcher>();
    const result = await collectDiff({
      platform,
      manager,
      profiles: ["base"],
      config: managerConfig,
      which: async () => manager,
      run: matchingInventory,
      offline: true,
      fetcher,
    });
    expect(result.unavailable).toBe(false);
    expect(result.sections[0]).toMatchObject({
      status: "same",
      warnings: [`Using cached manifest for ${path} (offline mode).`],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("accepts server-validated cache without warnings", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-diff-cache-"));
    roots.push(root);
    const managerConfig = config(root);
    await fetchManifest({
      path,
      config: managerConfig,
      fetcher: async () => new Response(body, { headers: { ETag: '"v1"' } }),
    });
    const result = await collectDiff({
      platform,
      manager,
      profiles: ["base"],
      config: managerConfig,
      which: async () => manager,
      run: matchingInventory,
      fetcher: async (_url, init) => {
        expect(new Headers(init?.headers).get("If-None-Match")).toBe('"v1"');
        return new Response(null, { status: 304 });
      },
    });
    expect(result.unavailable).toBe(false);
    expect(result.sections[0]?.status).toBe("same");
    expect(result.sections[0]?.warnings).toBeUndefined();
  });
});
