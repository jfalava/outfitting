import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, test } from "vitest";

import { runSetup } from "@/setup/run";
import { SETUP_MANIFEST_PATHS } from "@/setup/manifests";
import { writeRepoPath, validateOutfittingRepo } from "@/config/repo";

const temps: string[] = [];

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
    expect(written.repo.root).toBe(await validateOutfittingRepo(repo).then((r) => r.root));
    const stored = (await readFile(join(state, "repo-path"), "utf8")).trim();
    expect(stored).toBe(written.repo.root);
  });

  test("rejects paths without flake.nix", async () => {
    const empty = await tempDir("outfitting-empty-");
    await expect(validateOutfittingRepo(empty)).rejects.toThrow(/flake\.nix/);
  });
});

describe("runSetup", () => {
  test("materializes manifests via injected fetcher and writes repo-path", async () => {
    const state = await tempDir("outfitting-setup-");
    const repo = await fakeMonorepo();
    const home = await tempDir("outfitting-home-");

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
    expect((await readFile(join(state, "repo-path"), "utf8")).trim().length).toBeGreaterThan(0);

    for (const path of SETUP_MANIFEST_PATHS) {
      await access(join(state, "manifests", path));
    }
    void home;
  });
});
