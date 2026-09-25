import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "@/config/load";
import { migrateLegacyConfig } from "@/config/migrate";
import { configFilePath } from "@/config/paths";

const temps: string[] = [];

async function makeStateRoot() {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-config-migrate-"));
  temps.push(stateRoot);
  return stateRoot;
}

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("config migrate", () => {
  test("converts a legacy local config into the canonical TOML configuration", async () => {
    const stateRoot = await makeStateRoot();
    const repoRoot = join(stateRoot, "checkout");
    await mkdir(join(repoRoot, "packages"), { recursive: true });
    await writeFile(
      join(stateRoot, "config.json"),
      JSON.stringify({ machineId: "desk", linux: { profile: "desk" } }),
    );
    await writeFile(join(repoRoot, "packages", "apt.txt"), "curl\n");
    await writeFile(
      join(repoRoot, "outfitting.json"),
      JSON.stringify({
        schema: 1,
        profiles: { desk: { linux: { apt: { manifest: "packages/apt.txt" } } } },
      }),
    );

    const result = await migrateLegacyConfig({ stateRoot, repo: repoRoot });
    const config = await loadConfig({ stateRoot });

    expect(result.configPath).toBe(configFilePath(stateRoot));
    expect(config.machineId).toBe("desk");
    expect(config.source).toEqual({ kind: "local", path: repoRoot });
    expect(config.linux).toEqual({ profile: "desk" });
    expect(config.declarations?.profiles.desk?.linux?.apt).toEqual({
      manifest: "packages/apt.txt",
    });
    expect(await readFile(result.configPath, "utf8")).toContain("[profiles.desk.linux.apt]");
  });

  test("converts a cached remote BYOR profile and filters metadata from declarations", async () => {
    const stateRoot = await makeStateRoot();
    const repository = "https://github.com/example/dotfiles.git";
    const sourceRoot = join(stateRoot, "source");
    await writeFile(join(stateRoot, "config.json"), JSON.stringify({ machineId: "workstation" }));
    await writeFile(join(stateRoot, "repo-path"), `${sourceRoot}\n`);
    await writeFile(
      join(stateRoot, "byor.json"),
      JSON.stringify({
        repository,
        ref: "main",
        schema: 1,
        windows: { defaultProfiles: ["base"] },
        profiles: {
          base: {
            windows: {
              winget: { manifest: "packages/base.json" },
            },
          },
        },
      }),
    );

    const result = await migrateLegacyConfig({ stateRoot });
    const config = await loadConfig({ stateRoot });

    expect(config.machineId).toBe("workstation");
    expect(config.source).toEqual({ kind: "remote", repository, ref: "main" });
    expect(config.declarations?.profiles.base?.windows).toEqual({
      winget: { manifest: "packages/base.json" },
    });
    expect(await readFile(result.configPath, "utf8")).not.toContain("defaultProfiles");
    await expect(readFile(join(stateRoot, "config.json"), "utf8")).resolves.toContain("machineId");
    await expect(readFile(join(stateRoot, "byor.json"), "utf8")).resolves.toContain(
      "defaultProfiles",
    );
  });

  test("refuses conflicting local and remote legacy sources without writing TOML", async () => {
    const stateRoot = await makeStateRoot();
    await writeFile(join(stateRoot, "config.json"), JSON.stringify({ machineId: "desk" }));
    await writeFile(
      join(stateRoot, "byor.json"),
      JSON.stringify({
        repository: "https://github.com/example/dotfiles.git",
        ref: "main",
        schema: 1,
        profiles: { base: { windows: { winget: { manifest: "apps.json" } } } },
      }),
    );
    await writeFile(join(stateRoot, "repo-path"), `${join(stateRoot, "checkout")}\n`);

    await expect(migrateLegacyConfig({ stateRoot })).rejects.toThrow(
      /both byor\.json and repo-path/i,
    );
    await expect(readFile(configFilePath(stateRoot), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("does not overwrite an existing TOML config", async () => {
    const stateRoot = await makeStateRoot();
    await writeFile(
      join(stateRoot, "byor.json"),
      JSON.stringify({
        repository: "https://github.com/example/dotfiles.git",
        ref: "main",
        schema: 1,
        profiles: { base: { windows: { winget: { manifest: "apps.json" } } } },
      }),
    );
    await writeFile(configFilePath(stateRoot), 'machine_id = "existing"\n');

    await expect(migrateLegacyConfig({ stateRoot })).rejects.toMatchObject({ code: "EEXIST" });
    await expect(readFile(configFilePath(stateRoot), "utf8")).resolves.toBe(
      'machine_id = "existing"\n',
    );
  });

  test("does not leave a partial config if converted declarations fail validation", async () => {
    const stateRoot = await makeStateRoot();
    const repoRoot = join(stateRoot, "checkout");
    await mkdir(repoRoot);
    await writeFile(
      join(repoRoot, "outfitting.json"),
      JSON.stringify({
        schema: 1,
        profiles: { desk: { linux: { apt: { manifest: "missing.txt" } } } },
      }),
    );

    await expect(migrateLegacyConfig({ stateRoot, repo: repoRoot })).rejects.toThrow(
      /missing\.txt|not found|does not exist/i,
    );
    await expect(readFile(configFilePath(stateRoot), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
