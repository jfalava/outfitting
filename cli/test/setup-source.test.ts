import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadConfig, type ManagerConfig, sparseSourceRoot } from "@/config";
import { syncMacosSource } from "@/setup/source";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "outfitting-source-"));
  temps.push(dir);
  return dir;
}

async function testConfig(root: string): Promise<ManagerConfig> {
  return loadConfig({ stateRoot: root });
}

function response(body: string, status = 200): Response {
  return new Response(body, { status, headers: { etag: '"source-v1"' } });
}

describe("syncMacosSource", () => {
  test("publishes the complete allowlisted source closure", async () => {
    const root = await tempRoot();
    const config = await testConfig(root);
    const result = await syncMacosSource({
      config,
      fetcher: async (url) => response(`source:${url}\n`),
    });
    const expectedPaths = [
      "system/macos/flake.nix",
      "system/macos/darwin.nix",
      "system/macos/home.nix",
      "system/macos/zsh/macos.plugin.zsh",
      "system/common/zsh.nix",
      "system/common/zsh/outfitting.plugin.zsh",
      "packages/common/programs.nix",
      "packages/common/packages.nix",
      "packages/macos/programs.nix",
      "packages/macos/packages.nix",
      "packages/macos/zed.nix",
      "packages/macos/Brewfile",
      "fonts/fontget.txt",
    ];

    expect(result.root).toBe(sparseSourceRoot(root));
    expect(result.files.map((file) => file.path)).toEqual(expectedPaths);
    for (const path of expectedPaths) {
      await access(join(result.root, path));
    }
    await expect(access(join(result.root, "packages", "bun.txt"))).rejects.toThrow();
  });

  test("keeps the previous source when a refresh cannot complete", async () => {
    const root = await tempRoot();
    const config = await testConfig(root);
    const first = await syncMacosSource({
      config,
      fetcher: async (url) => response(`old:${url}\n`),
    });
    const nextConfig: ManagerConfig = {
      ...config,
      manifest: { ...config.manifest, ref: "next" },
    };

    await expect(
      syncMacosSource({
        config: nextConfig,
        fetcher: async (url) =>
          url.endsWith("darwin.nix") ? response("missing", 404) : response(`new:${url}\n`),
      }),
    ).rejects.toThrow(/HTTP 404/);

    expect(await readFile(join(first.root, "system", "macos", "flake.nix"), "utf8")).toMatch(
      /^old:/,
    );
  });

  test("rejects paths outside the allowlist", async () => {
    const root = await tempRoot();
    const config = await testConfig(root);

    await expect(
      syncMacosSource({
        config,
        paths: ["../outside"],
        fetcher: async () => response("should not fetch"),
      }),
    ).rejects.toThrow(/non-allowlisted/);
  });
});
