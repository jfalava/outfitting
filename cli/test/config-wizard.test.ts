import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { stringify as stringifyToml } from "smol-toml";
import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "@/config/load";
import { buildWizardConfigDocument } from "@/config/wizard";
import { publishValidatedConfig } from "@/config/write";
import type { ByorContract } from "@/source/contract";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "outfitting-config-wizard-test-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

const contract: ByorContract = {
  schema: 1,
  windows: {
    defaultProfiles: ["base"],
    scoop: { manifest: "packages/scoop.json" },
  },
  profiles: {
    base: {
      linux: { apt: { manifest: "packages/base-apt.txt" } },
      windows: { winget: { manifest: "packages/base-winget.txt" } },
    },
    workstation: {
      linux: { pacman: { manifest: "packages/workstation-pacman.txt" } },
      windows: { winget: { manifest: "packages/workstation-winget.txt" } },
    },
  },
};

describe("config wizard document", () => {
  test("selects the requested Linux profile while retaining the source contract", async () => {
    const root = await temporaryRoot();
    const target = join(root, "nested", "config.toml");
    const document = buildWizardConfigDocument(
      contract,
      { repository: "https://github.com/example/dotfiles.git", ref: "main" },
      "linux",
      ["workstation"],
    );

    await publishValidatedConfig(root, target, `${stringifyToml(document)}\n`);
    const config = await loadConfig({ stateRoot: root, configPath: target });

    expect(config.source).toEqual({
      kind: "remote",
      repository: "https://github.com/example/dotfiles.git",
      ref: "main",
    });
    expect(config.linux).toEqual({ profile: "workstation" });
    expect(config.declarations?.profiles.workstation?.linux?.pacman).toEqual({
      manifest: "packages/workstation-pacman.txt",
    });
    expect(config.declarations?.profiles.base?.linux?.apt).toEqual({
      manifest: "packages/base-apt.txt",
    });
  });

  test("stores only selected Windows profiles and moves shared declarations out of defaults", async () => {
    const root = await temporaryRoot();
    const target = join(root, "config.toml");
    const document = buildWizardConfigDocument(
      contract,
      { path: join(root, "checkout") },
      "windows",
      ["workstation"],
    );

    await publishValidatedConfig(root, target, `${stringifyToml(document)}\n`);
    const config = await loadConfig({ stateRoot: root, configPath: target });

    expect(config.windows).toEqual({ profiles: ["workstation"] });
    expect(config.declarations?.windows).toEqual({ scoop: { manifest: "packages/scoop.json" } });
    expect(config.declarations?.profiles.workstation?.windows?.winget).toEqual({
      manifest: "packages/workstation-winget.txt",
    });
  });
});

test("publishes with private permissions and never overwrites an existing config", async () => {
  const root = await temporaryRoot();
  const target = join(root, "config.toml");
  const document = buildWizardConfigDocument(contract, { path: join(root, "checkout") }, "linux", [
    "base",
  ]);
  const serialized = `${stringifyToml(document)}\n`;

  await publishValidatedConfig(root, target, serialized);
  const before = await readFile(target, "utf8");
  if (process.platform !== "win32") {
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  }

  await expect(publishValidatedConfig(root, target, serialized)).rejects.toMatchObject({
    code: "EEXIST",
  });
  await expect(readFile(target, "utf8")).resolves.toBe(before);
});
