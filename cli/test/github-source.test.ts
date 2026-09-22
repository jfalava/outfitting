import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadConfig, sparseSourceRoot, type ManagerConfig } from "@/config";
import { classifyGitHubRepository, normalizeRepositoryUrl, readGitHubBlob } from "@/fetch/github";
import { syncByorSparseSource } from "@/setup/source";
import { writeByorProfile } from "@/source/byor-map";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "outfitting-github-"));
  temps.push(dir);
  return dir;
}

describe("classifyGitHubRepository", () => {
  test("public github.com uses raw URLs and Enterprise uses gh against the named host", () => {
    expect(classifyGitHubRepository("https://pepito.ghe.com/jalava/machine-config")).toMatchObject({
      host: "pepito.ghe.com",
      owner: "jalava",
      name: "machine-config",
      transport: "gh",
    });
    expect(classifyGitHubRepository("https://pepito.ghe.com/jalava/machine-config")?.baseUrl).not.toContain(
      "raw.githubusercontent.com",
    );
    expect(classifyGitHubRepository("https://github.com/org/machine-config.git")).toEqual({
      host: "github.com",
      owner: "org",
      name: "machine-config",
      baseUrl: "https://raw.githubusercontent.com/org/machine-config",
      transport: "raw",
    });
    expect(normalizeRepositoryUrl("https://github.com/org/machine-config")).toBe(
      "https://raw.githubusercontent.com/org/machine-config",
    );

    const enterprise = classifyGitHubRepository("https://github.example.com/org/machine-config");
    expect(enterprise).toMatchObject({
      host: "github.example.com",
      owner: "org",
      name: "machine-config",
      transport: "gh",
    });
    expect(enterprise?.baseUrl).not.toContain("raw.githubusercontent.com");
    expect(normalizeRepositoryUrl("https://github.example.com/org/machine-config")).toBe(
      "https://github.example.com/org/machine-config",
    );
  });
});

describe("readGitHubBlob", () => {
  test("reads a file and a nested flake directory through the hostname in the repo URL", async () => {
    const calls: string[] = [];
    const files = await readGitHubBlob({
      repository: {
        host: "github.example.com",
        owner: "org",
        name: "machine-config",
        baseUrl: "https://github.example.com/api/v3",
        transport: "gh",
      },
      ref: "main",
      path: "nix/darwin",
      run: async (_command, args) => {
        const endpoint = args.at(-1) ?? "";
        calls.push(endpoint);
        expect(args.slice(0, 3)).toEqual(["api", "--hostname", "github.example.com"]);
        if (endpoint.endsWith("/contents/nix/darwin?ref=main")) {
          return {
            code: 0,
            stdout: JSON.stringify([
              { type: "file", path: "nix/darwin/flake.nix", encoding: "base64", content: Buffer.from("{}\n").toString("base64") },
              { type: "dir", path: "nix/darwin/modules" },
            ]),
            stderr: "",
          };
        }
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              type: "file",
              path: "nix/darwin/modules/host.nix",
              encoding: "base64",
              content: Buffer.from("host\n").toString("base64"),
            },
          ]),
          stderr: "",
        };
      },
    });

    expect(calls[0]).toBe(
      "/repos/org/machine-config/contents/nix/darwin?ref=main",
    );
    expect(files.map((file) => file.path).sort()).toEqual(["flake.nix", "modules/host.nix"]);
    expect(new TextDecoder().decode(files.find((file) => file.path === "modules/host.nix")?.body)).toBe(
      "host\n",
    );
  });
});

describe("syncByorSparseSource", () => {
  test("leaves the previous source tree when a mapped file is missing", async () => {
    const root = await tempRoot();
    const config = await loadConfig({ stateRoot: root });
    const remoteConfig: ManagerConfig = {
      ...config,
      manifest: {
        baseUrl: "https://raw.githubusercontent.com/org/machine-config",
        ref: "main",
      },
    };
    const source = sparseSourceRoot(root);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "keep.txt"), "previous\n");

    await writeByorProfile({
      stateRoot: root,
      name: "desk",
      profile: {
        linux: {
          apt: { manifest: "packages/apt.txt" },
          nix: { flake: "nix/linux", attribute: "homeConfigurations.desk.activationPackage" },
          paths: [],
        },
      },
    });
    const requested: string[] = [];
    await expect(
      syncByorSparseSource({
        config: remoteConfig,
        platform: "linux",
        profile: "desk",
        fetcher: async (url) => {
          requested.push(url);
          return new Response("missing", { status: 404 });
        },
      }),
    ).rejects.toThrow(/packages\/apt.txt/);
    expect(requested.some((url) => url.endsWith("/outfitting.json"))).toBe(false);
    expect(await readFile(join(source, "keep.txt"), "utf8")).toBe("previous\n");
  });
});
