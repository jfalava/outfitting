import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { ensureStateRoot, loadConfig, type ManagerConfig } from "@/config";
import { fetchManifest, manifestUrl, readCachedManifest } from "@/fetch";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "outfitting-fetch-"));
  temps.push(dir);
  return dir;
}

async function testConfig(root: string): Promise<ManagerConfig> {
  await ensureStateRoot(root);
  return loadConfig({ stateRoot: root });
}

function mockResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

describe("manifestUrl", () => {
  test("joins base, ref, and encoded path", () => {
    const url = manifestUrl(
      {
        manifest: {
          baseUrl: "https://raw.githubusercontent.com/jfalava/outfitting",
          ref: "main",
        },
      },
      "packages/macos/Brewfile",
    );
    expect(url).toBe(
      "https://raw.githubusercontent.com/jfalava/outfitting/main/packages/macos/Brewfile",
    );
  });
});

describe("fetchManifest", () => {
  test("fetches, caches with etag, and revalidates with 304", async () => {
    const root = await tempRoot();
    const config = await testConfig(root);
    let calls = 0;
    const bodies: string[] = [];

    const fetcher = async (input: string, init?: RequestInit) => {
      calls += 1;
      const headers = new Headers(init?.headers);
      if (calls === 1) {
        expect(input).toContain("packages/macos/Brewfile");
        return mockResponse(200, 'tap "example/tap"\n', {
          etag: '"v1"',
          "content-type": "text/plain",
        });
      }
      expect(headers.get("If-None-Match")).toBe('"v1"');
      // Build a minimal 304-like response without relying on Response body rules.
      return {
        ok: false,
        status: 304,
        headers: new Headers({ etag: '"v1"' }),
        async arrayBuffer() {
          return new ArrayBuffer(0);
        },
      } as Response;
    };

    const first = await fetchManifest({
      path: "packages/macos/Brewfile",
      config,
      fetcher,
      materialize: true,
    });
    expect(first.source).toBe("network");
    expect(first.text).toContain("example/tap");
    expect(first.etag).toBe('"v1"');
    expect(first.materializedPath).toContain("manifests/packages/macos/Brewfile");
    bodies.push(first.text);

    const cached = await readCachedManifest(join(root, "cache", "manifests"), first.url);
    expect(cached?.meta.etag).toBe('"v1"');

    const second = await fetchManifest({
      path: "packages/macos/Brewfile",
      config,
      fetcher,
    });
    expect(second.source).toBe("network");
    expect(second.warning).toBeUndefined();
    expect(second.text).toBe(bodies[0]);
    expect(calls).toBe(2);
  });

  test("falls back to cache on network failure with warning", async () => {
    const root = await tempRoot();
    const config = await testConfig(root);
    let calls = 0;

    const fetcher = async () => {
      calls += 1;
      if (calls === 1) {
        return mockResponse(200, "cached-body\n", { etag: '"e1"' });
      }
      throw new Error("offline");
    };

    await fetchManifest({ path: "packages/macos/Brewfile", config, fetcher });
    const fallback = await fetchManifest({
      path: "packages/macos/Brewfile",
      config,
      fetcher,
    });
    expect(fallback.source).toBe("cache");
    expect(fallback.warning).toMatch(/offline|Network failed/i);
    expect(fallback.text).toBe("cached-body\n");
  });

  test("offline mode requires cache", async () => {
    const root = await tempRoot();
    const config = await testConfig(root);
    await expect(
      fetchManifest({
        path: "packages/macos/Brewfile",
        config,
        offline: true,
        fetcher: async () => {
          throw new Error("should not fetch");
        },
      }),
    ).rejects.toThrow(/No cached manifest/);
  });

  test("HTTP error without cache fails hard", async () => {
    const root = await tempRoot();
    const config = await testConfig(root);
    await expect(
      fetchManifest({
        path: "missing.txt",
        config,
        fetcher: async () => mockResponse(404, "nope"),
      }),
    ).rejects.toThrow(/HTTP 404/);
  });
});
