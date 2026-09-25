import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadConfig } from "@/config";
import { validateOutfittingRepo } from "@/config/repo";
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
  await writeFile(join(root, "packages.txt"), "curl\njq\n");
  return root;
}

async function localConfig(state: string, repo: string) {
  await writeFile(
    join(state, "config.toml"),
    `schema = 1\n[source]\npath = ${JSON.stringify(repo)}\n[linux]\nprofile = "desk"\n[profiles.desk.linux.apt]\nmanifest = "packages.txt"\n`,
  );
  return loadConfig({ stateRoot: state });
}

describe("validateOutfittingRepo", () => {
  test("resolves a local checkout using declarations from config.toml", async () => {
    const state = await tempDir("outfitting-state-");
    const repo = await localByorRepo();
    const config = await localConfig(state, repo);
    const resolved = await validateOutfittingRepo(repo, {
      contract: config.declarations!,
      profile: "desk",
    });
    expect(resolved).toMatchObject({ root: repo, flakeKind: "none" });
    expect(await readdir(state)).toEqual(["config.toml"]);
  });

  test("rejects missing local source paths", async () => {
    const empty = await tempDir("outfitting-empty-");
    const config = await localConfig(empty, join(empty, "missing"));
    await expect(
      validateOutfittingRepo(config.source!.kind === "local" ? config.source!.path : "", {
        contract: config.declarations!,
      }),
    ).rejects.toThrow(/does not exist/);
  });
});

describe("runSetup", () => {
  test("uses a local BYOR checkout without fetching or requiring remote configuration", async () => {
    const stateRoot = await tempDir("outfitting-setup-");
    const repo = await localByorRepo();
    const config = await localConfig(stateRoot, repo);
    const fetcher = vi.fn(async () => new Response("must not fetch"));

    await Effect.runPromise(
      runSetup({
        platform: "linux",
        stateRoot,
        repo,
        repoProfile: "desk",
        machineId: "test:x86_64-linux",
        fetcher,
        config,
        skipSymlinks: true,
      }),
    );

    expect(await readdir(stateRoot)).toEqual(["config.toml"]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("fails before setup when profile declarations are absent", async () => {
    const stateRoot = await tempDir("outfitting-unconfigured-");
    await expect(resolveSetupSource({ stateRoot, platform: "linux" })).rejects.toThrow(
      /No profile declarations are configured/,
    );
  });
});
