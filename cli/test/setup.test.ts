import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, test, vi } from "vitest";

import { writeRepoPath, validateOutfittingRepo } from "@/config/repo";
import { resolveSetupSource, runSetup } from "@/setup/run";

const temps: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

async function localByorRepo(): Promise<string> {
  const root = await tempDir("outfitting-local-byor-");
  await writeFile(
    join(root, "outfitting.json"),
    `${JSON.stringify({ schema: 1, profiles: { desk: { linux: { apt: { manifest: "packages.txt" } } } } })}\n`,
  );
  await writeFile(join(root, "packages.txt"), "curl\njq\n");
  return root;
}

describe("writeRepoPath / validateOutfittingRepo", () => {
  test("persists an absolute BYOR checkout path with a private file mode", async () => {
    const state = await tempDir("outfitting-state-");
    const repo = await localByorRepo();
    const written = await writeRepoPath(repo, { stateRoot: state, profile: "desk" });
    expect(written.repo.root).toBe(repo);
    expect((await readFile(join(state, "repo-path"), "utf8")).trim()).toBe(repo);
    expect((await stat(join(state, "repo-path"))).mode & 0o777).toBe(0o600);
  });

  test("rejects paths without a root outfitting.json contract", async () => {
    const empty = await tempDir("outfitting-empty-");
    await expect(validateOutfittingRepo(empty)).rejects.toThrow(/outfitting.json/);
  });
});

describe("runSetup", () => {
  test("uses a local BYOR checkout without fetching or requiring remote configuration", async () => {
    const stateRoot = await tempDir("outfitting-setup-");
    const repo = await localByorRepo();
    const fetcher = vi.fn(async () => new Response("must not fetch"));

    await Effect.runPromise(
      runSetup({
        platform: "linux",
        stateRoot,
        repo,
        repoProfile: "desk",
        machineId: "test:x86_64-linux",
        fetcher,
        skipSymlinks: true,
      }),
    );

    const config = JSON.parse(await readFile(join(stateRoot, "config.json"), "utf8")) as {
      machineId: string;
    };
    expect(config.machineId).toBe("test:x86_64-linux");
    expect((await readFile(join(stateRoot, "repo-path"), "utf8")).trim()).toBe(repo);
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("fails before setup when neither a local checkout nor byor.json is configured", async () => {
    const stateRoot = await tempDir("outfitting-unconfigured-");
    await expect(resolveSetupSource({ stateRoot, platform: "linux" })).rejects.toThrow(
      /No local outfitting.json checkout or remote source is configured/,
    );
  });
});
