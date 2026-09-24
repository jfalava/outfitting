import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { writeRepoPath, type ManagerConfig } from "@/config";
import { collectDiff, parseWingetExport } from "@/diff/compare";
import { parseBrewfileManifest } from "@/update/brew";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function localSource(options: {
  stateRoot: string;
  repoRoot: string;
  contract: unknown;
  files: Record<string, string>;
  profile: string;
}): Promise<ManagerConfig> {
  await mkdir(options.repoRoot, { recursive: true });
  await writeFile(
    join(options.repoRoot, "outfitting.json"),
    `${JSON.stringify(options.contract)}\n`,
  );
  for (const [path, body] of Object.entries(options.files)) {
    const target = join(options.repoRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  await writeRepoPath(options.repoRoot, {
    stateRoot: options.stateRoot,
    profile: options.profile,
  });
  return {
    stateRoot: options.stateRoot,
    machineId: "test:local",
    machineIdOverridden: true,
  };
}

describe("diff parsers", () => {
  test("parses Homebrew entries and ignores unrelated Brewfile records", () => {
    const brewfile = [
      'tap "cloudflare/cloudflare", trusted: true',
      'brew "jq"',
      'brew "jq"',
      'cask "Firefox"',
      'package "not-homebrew"',
    ].join("\n");
    expect(parseBrewfileManifest(brewfile)).toEqual({
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

describe("BYOR-backed collectDiff", () => {
  test("compares only the Brewfile declared by the selected macOS profile", async () => {
    const stateRoot = await tempRoot("outfitting-diff-brew-state-");
    const repoRoot = await tempRoot("outfitting-diff-brew-repo-");
    const config = await localSource({
      stateRoot,
      repoRoot,
      profile: "workstation",
      contract: {
        schema: 1,
        profiles: {
          workstation: {
            macos: {
              nix: { flake: "nix", attribute: "darwinConfigurations.workstation.system" },
              brewfile: "custom/Brewfile",
            },
          },
        },
      },
      files: {
        "nix/flake.nix": "{ outputs = { ... }: { darwinConfigurations = {}; }; }\n",
        "custom/Brewfile": 'brew "jq"\n',
        "packages/macos/Brewfile": 'brew "must-not-be-read"\n',
      },
    });
    const result = await collectDiff({
      platform: "macos",
      manager: "brew",
      profiles: ["workstation"],
      config,
      which: async () => "brew",
      run: async (_command, args) => ({
        code: 0,
        stdout: args[0] === "list" && args.includes("--formula") ? "jq\n" : "",
        stderr: "",
      }),
    });

    expect(result.sections[0]).toMatchObject({ manager: "brew", status: "same" });
  });

  test("skips Homebrew when the selected BYOR profile has no Brewfile", async () => {
    const stateRoot = await tempRoot("outfitting-diff-no-brew-state-");
    const repoRoot = await tempRoot("outfitting-diff-no-brew-repo-");
    const config = await localSource({
      stateRoot,
      repoRoot,
      profile: "workstation",
      contract: {
        schema: 1,
        profiles: {
          workstation: {
            macos: { nix: { flake: "nix", attribute: "darwinConfigurations.workstation.system" } },
          },
        },
      },
      files: { "nix/flake.nix": "{ outputs = { ... }: { darwinConfigurations = {}; }; }\n" },
    });
    const which = vi.fn(async () => undefined);
    const result = await collectDiff({ platform: "macos", manager: "brew", config, which });

    expect(result.sections[0]).toMatchObject({ status: "same", message: /declares no Brewfile/ });
    expect(which).not.toHaveBeenCalled();
  });

  test("reads an arbitrary Linux profile's declared package list", async () => {
    const stateRoot = await tempRoot("outfitting-diff-linux-state-");
    const repoRoot = await tempRoot("outfitting-diff-linux-repo-");
    const config = await localSource({
      stateRoot,
      repoRoot,
      profile: "debian-minimal",
      contract: {
        schema: 1,
        profiles: {
          "debian-minimal": { linux: { apt: { manifest: "lists/minimal.apt" } } },
        },
      },
      files: { "lists/minimal.apt": "curl\ngit\n" },
    });
    const result = await collectDiff({
      platform: "linux",
      manager: "apt",
      profiles: ["debian-minimal"],
      config,
      which: async (command) =>
        ({ apt: "/usr/bin/apt", "dpkg-query": "/usr/bin/dpkg-query" })[command],
      run: async () => ({
        code: 0,
        stdout: "curl:amd64\tinstall ok installed\nvim\tinstall ok installed\n",
        stderr: "",
      }),
    });

    expect(result.sections[0]).toMatchObject({
      manager: "apt",
      status: "different",
      missing: ["git"],
      extra: [],
      message: expect.stringContaining("unrelated installed packages are ignored"),
    });
  });

  test("skips Scoop when BYOR omits a Scoop declaration", async () => {
    const stateRoot = await tempRoot("outfitting-diff-scoop-state-");
    const repoRoot = await tempRoot("outfitting-diff-scoop-repo-");
    const config = await localSource({
      stateRoot,
      repoRoot,
      profile: "work",
      contract: {
        schema: 1,
        windows: { defaultProfiles: ["work"] },
        profiles: { work: { windows: { winget: { manifest: "windows/work.txt" } } } },
      },
      files: { "windows/work.txt": "Git.Git\n" },
    });
    const which = vi.fn(async () => undefined);
    const result = await collectDiff({ platform: "windows", manager: "scoop", config, which });

    expect(result.sections[0]).toMatchObject({ status: "same", message: /No Scoop manifest/ });
    expect(which).not.toHaveBeenCalled();
  });
});
