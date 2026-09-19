import { access, mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, test } from "vitest";

import { sparseSourceRoot } from "@/config";
import { writeRepoPath, validateOutfittingRepo } from "@/config/repo";
import { runSetup } from "@/setup/run";

const temps: string[] = [];
const TEST_MACOS_SOURCE_PATHS = [
  "system/macos/flake.nix",
  "system/macos/darwin.nix",
  "system/macos/home.nix",
  "system/macos/zsh/macos.plugin.zsh",
  "system/common/zsh.nix",
  "system/common/zsh/outfitting.plugin.zsh",
  "system/common/zsh/hm-profile.inc.zsh",
  "packages/common/programs.nix",
  "packages/common/packages.nix",
  "packages/common/opencode-mcp.nix",
  "packages/macos/programs.nix",
  "packages/macos/packages.nix",
  "packages/macos/zed.nix",
  "packages/macos/Brewfile",
  "fonts/fontget.txt",
];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

async function fakeMonorepo(): Promise<string> {
  const root = await tempDir("outfitting-repo-");
  await mkdir(join(root, "system", "macos"), { recursive: true });
  await writeFile(join(root, "system", "macos", "flake.nix"), "{}\n", "utf8");
  await writeFile(join(root, "system", "macos", "darwin.nix"), "{}\n", "utf8");
  return root;
}

describe("writeRepoPath / validateOutfittingRepo", () => {
  test("persists absolute path with mode-friendly file", async () => {
    const state = await tempDir("outfitting-state-");
    const repo = await fakeMonorepo();
    const written = await writeRepoPath(repo, { stateRoot: state });
    const expectedRoot = await realpath(repo);
    expect(written.repo.root).toBe(expectedRoot);
    expect((await readFile(join(state, "repo-path"), "utf8")).trim()).toBe(expectedRoot);
    expect((await stat(join(state, "repo-path"))).mode & 0o777).toBe(0o600);
  });

  test("rejects paths without a recognized source marker", async () => {
    const empty = await tempDir("outfitting-empty-");
    await expect(validateOutfittingRepo(empty)).rejects.toThrow(/recognized source marker/);
  });
});

describe("runSetup", () => {
  test("materializes manifests via injected fetcher and writes repo-path", async () => {
    const state = await tempDir("outfitting-setup-");
    const repo = await fakeMonorepo();
    const expectedRepoRoot = await realpath(repo);

    const fetcher = async (url: string) => {
      const body = url.includes("Brewfile") ? 'tap "x/y"\n' : "alchemy\n";
      return new Response(body, {
        status: 200,
        headers: { etag: '"t1"', "content-type": "text/plain" },
      });
    };

    await Effect.runPromise(
      runSetup({
        stateRoot: state,
        repo,
        machineId: "test:aarch64-darwin",
        fetcher,
        // ensureNixSymlinks uses real homedir; skip to keep test hermetic
        skipSymlinks: true,
      }),
    );

    const config = JSON.parse(await readFile(join(state, "config.json"), "utf8")) as {
      machineId: string;
    };
    expect(config.machineId).toBe("test:aarch64-darwin");
    expect((await readFile(join(state, "repo-path"), "utf8")).trim()).toBe(expectedRepoRoot);

    for (const path of TEST_MACOS_SOURCE_PATHS) {
      await access(join(state, "manifests", path));
    }
  });

  test("fetches sparse macOS source and persists its repo-path", async () => {
    const state = await tempDir("outfitting-sparse-setup-");

    await Effect.runPromise(
      runSetup({
        stateRoot: state,
        sourcePaths: TEST_MACOS_SOURCE_PATHS,
        fetcher: async (url) => new Response(`source:${url}\n`, { status: 200 }),
        skipSymlinks: true,
      }),
    );

    expect((await readFile(join(state, "repo-path"), "utf8")).trim()).toBe(
      await realpath(sparseSourceRoot(state)),
    );
    for (const path of TEST_MACOS_SOURCE_PATHS) {
      await access(join(sparseSourceRoot(state), path));
    }
  });

  test("validates the complete macOS source contract before symlink setup", async () => {
    const state = await tempDir("outfitting-validated-setup-");
    let symlinksCalled = false;
    const ensureSymlinks = async () => {
      symlinksCalled = true;
    };

    await Effect.runPromise(
      runSetup({
        stateRoot: state,
        sourcePaths: TEST_MACOS_SOURCE_PATHS,
        fetcher: async (url) => {
          const body = url.endsWith("flake.nix")
            ? "darwinConfigurations = {};\n"
            : url.endsWith("Brewfile")
              ? 'brew "jq"\n'
              : "{}\n";
          return new Response(body, { status: 200 });
        },
        validateSource: true,
        ensureSymlinks,
      }),
    );
    expect(symlinksCalled).toBe(true);
  });

  test("rejects a malformed sparse flake before symlink setup", async () => {
    const state = await tempDir("outfitting-invalid-setup-");
    let symlinksCalled = false;

    await expect(
      Effect.runPromise(
        runSetup({
          stateRoot: state,
          sourcePaths: TEST_MACOS_SOURCE_PATHS,
          fetcher: async (url) =>
            new Response(url.endsWith("flake.nix") ? "not a flake\n" : "{}\n", { status: 200 }),
          validateSource: true,
          ensureSymlinks: async () => {
            symlinksCalled = true;
          },
        }),
      ),
    ).rejects.toThrow(/darwinConfigurations/);
    expect(symlinksCalled).toBe(false);
  });
});
