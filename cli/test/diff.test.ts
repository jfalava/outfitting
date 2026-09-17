import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { collectDiff, parseWingetExport } from "@/diff/compare";
import type { RunCommandResult } from "@/process";
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
    const result = await collectDiff({
      platform: "macos",
      manager: "brew",
      config: config(root),
      which: async () => "brew",
      fetcher: async () => new Response('tap "cloudflare/cloudflare"\nbrew "jq"\ncask "Firefox"\n'),
      run: async (command, args) => {
        calls.push(`${command} ${args.join(" ")}`);
        if (args[0] === "tap") return ok("cloudflare/cloudflare\n");
        if (args[0] === "leaves") return ok("jq\n");
        return ok("Firefox\n");
      },
    });

    expect(result.differences).toBe(false);
    expect(result.sections[0]).toMatchObject({ manager: "brew", status: "same" });
    expect(calls.every((call) => !/install|uninstall|bundle|upgrade|cleanup/.test(call))).toBe(
      true,
    );
  });

  test("compares WinGet export state and reports missing and extra packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-diff-winget-"));
    roots.push(root);
    const calls: string[] = [];
    const result = await collectDiff({
      platform: "windows",
      manager: "winget",
      config: config(root),
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
  });

});
