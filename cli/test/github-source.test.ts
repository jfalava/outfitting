import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Console, Effect } from "effect";
import { afterEach, describe, expect, test, vi } from "vitest";

import { saveByorWizardAnswers } from "@/commands/byor";
import { initializeWindows } from "@/commands/setup/windows";
import { loadConfig, sparseSourceRoot, saveConfigFile } from "@/config";
import type { ManifestFetcher } from "@/fetch";
import {
  classifyGitHubRepository,
  isRemoteByorSource,
  normalizeRepositoryUrl,
  readGitHubBlobs,
} from "@/fetch/github";
import type { runCommand } from "@/process";
import { runLinuxInit } from "@/setup/linux";
import { runSetup } from "@/setup/run";
import { syncByorSparseSource } from "@/setup/source";
import { readByorMap, writeByorProfile } from "@/source/byor-map";
import { readByorContract } from "@/source/contract";
import { readWindowsLock } from "@/update/windows-lock";

const temps: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
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
    expect(
      classifyGitHubRepository("https://pepito.ghe.com/jalava/machine-config")?.baseUrl,
    ).not.toContain("raw.githubusercontent.com");
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

function remoteFixture(host: string) {
  const bodies = new Map([
    ["packages/apt.txt", "curl\njq\n"],
    ["packages/windows.txt", "Git.Git\n"],
    ["packages/dev.txt", "Microsoft.VisualStudioCode\n"],
    [
      "nix/flake.nix",
      "{ outputs = inputs: { homeConfigurations = {}; darwinConfigurations = {}; }; }\n",
    ],
    ["nix/flake.lock", '{"version":7,"nodes":{}}\n'],
    ["nix/darwin.nix", "{}\n"],
    ["nix/modules/host.nix", "{ programs.zsh.enable = true; }\n"],
    ["nix/run.sh", "#!/bin/sh\nexit 0\n"],
    ["nix-extra/ignored.nix", "not selected\n"],
  ]);
  const tree = {
    truncated: false,
    tree: [...bodies.keys()].map((path, i) => ({
      path,
      type: "blob",
      mode: path.endsWith(".sh") ? "100755" : "100644",
      sha: `blob-${i}`,
    })),
  };
  const requests: string[] = [];
  const json = (path: string) => {
    if (path === "/repos/org/machine-config/commits/feature%2Fdesk") {
      return { sha: "revision-a" };
    }
    if (path === "/repos/org/machine-config/git/trees/revision-a?recursive=1") {
      return tree;
    }
    const entry = tree.tree.find(
      (item) => path === `/repos/org/machine-config/git/blobs/${item.sha}`,
    );
    if (entry !== undefined && bodies.has(entry.path)) {
      return {
        encoding: "base64",
        content: Buffer.from(bodies.get(entry.path)!).toString("base64"),
      };
    }
    throw new Error(`Unexpected API request: ${path}`);
  };
  const fetcher: ManifestFetcher = async (url) => {
    requests.push(url);
    const parsed = new URL(url);
    if (parsed.hostname === "api.github.com") {
      return Response.json(json(`${parsed.pathname}${parsed.search}`));
    }
    const prefix = "https://raw.githubusercontent.com/org/machine-config/revision-a/";
    if (host !== "github.com" || !url.startsWith(prefix)) {
      throw new Error(`Unexpected unauthenticated download: ${url}`);
    }
    const body = bodies.get(decodeURIComponent(url.slice(prefix.length)));
    return new Response(body ?? "missing", { status: body === undefined ? 404 : 200 });
  };
  const run: typeof runCommand = async (command, args) => {
    expect(command).toBe("gh");
    expect(args.slice(0, 3)).toEqual(["api", "--hostname", host]);
    const endpoint = args.at(-1)!;
    requests.push(endpoint);
    return { code: 0, stderr: "", stdout: JSON.stringify(json(endpoint)) };
  };
  return { bodies, tree, requests, fetcher, run };
}

describe.each(["github.com", "pepito.ghe.com"])("remote BYOR on %s", (host) => {
  test("downloads files and nested directories once with stable repository paths and revision", async () => {
    const remote = remoteFixture(host);
    const files = await readGitHubBlobs({
      ...remote,
      repository: classifyGitHubRepository(`https://${host}/org/machine-config`)!,
      ref: "feature/desk",
      paths: ["packages/apt.txt", "nix", "nix/flake.nix"],
    });
    expect(files.map((file) => file.path)).toEqual([
      "packages/apt.txt",
      "nix/flake.nix",
      "nix/flake.lock",
      "nix/darwin.nix",
      "nix/modules/host.nix",
      "nix/run.sh",
    ]);
    expect(new TextDecoder().decode(files[0]!.body)).toBe("curl\njq\n");
    expect(files.at(-1)!.mode).toBe(0o755);
    expect(remote.requests).toHaveLength(8);
  });

  test.each(["linux", "macos", "windows"] as const)(
    "wizard → %s init uses saved config and materializes valid files",
    async (platform) => {
      for (const key of [
        "OUTFITTING_REPO",
        "OUTFITTING_MANIFEST_BASE_URL",
        "OUTFITTING_MANIFEST_REF",
      ]) {
        vi.stubEnv(key, "");
      }
      const stateRoot = await tempRoot();
      const remote = remoteFixture(host);
      await saveByorWizardAnswers(
        {
          repoUrl: `https://${host}/org/machine-config`,
          ref: "feature/desk",
          profile: "desk",
          platform,
          apt: "packages/apt.txt",
          flake: "nix",
          attribute:
            platform === "macos"
              ? "darwinConfigurations.desk.system"
              : "homeConfigurations.desk.activationPackage",
          winget: "packages/windows.txt",
          paths: [],
        },
        stateRoot,
      );
      // Unfetched profiles must not participate in validation or flake selection.
      await writeByorProfile({
        stateRoot,
        name: "unselected",
        profile: {
          linux: {
            nix: { flake: "absent", attribute: "homeConfigurations.other.activationPackage" },
          },
        },
      });
      const options = { stateRoot, ...remote };
      const init =
        platform === "linux"
          ? runLinuxInit({ ...options, profile: "desk" })
          : platform === "windows"
            ? initializeWindows({ ...options, profiles: ["desk"] })
            : runSetup({
                ...options,
                platform,
                repoProfile: "desk",
                validateSource: true,
                sourcePaths: ["system/macos/flake.nix"],
              });
      await Effect.runPromise(
        init.pipe(Effect.provideService(Console.Console, { ...console, log: () => {} })),
      );
      const source = sparseSourceRoot(stateRoot);
      const manifest =
        platform === "windows"
          ? "packages/windows.txt"
          : platform === "linux"
            ? "packages/apt.txt"
            : "nix/flake.nix";
      expect(await readFile(join(source, manifest), "utf8")).toBe(remote.bodies.get(manifest));
      expect(Object.keys((await readByorContract(source)).profiles)).toEqual(["desk"]);
      expect(Object.keys((await readByorMap(stateRoot))!.profiles)).toEqual(["desk", "unselected"]);
      if (platform !== "windows") {
        expect(await readFile(join(source, "nix/modules/host.nix"), "utf8")).toBe(
          "{ programs.zsh.enable = true; }\n",
        );
        expect(await readFile(join(source, "nix/flake.lock"), "utf8")).toBe(
          '{"version":7,"nodes":{}}\n',
        );
        expect((await stat(join(source, "nix/run.sh"))).mode & 0o111).not.toBe(0);
      } else {
        expect((await readWindowsLock(await loadConfig({ stateRoot }))).profiles).toEqual(["desk"]);
      }
      // A saved managed repo-path must not turn the next init into a stale local checkout.
      remote.bodies.set(manifest, `${remote.bodies.get(manifest)!}\n`);
      remote.requests.length = 0;
      await Effect.runPromise(
        (platform === "windows" ? initializeWindows(options) : init).pipe(
          Effect.provideService(Console.Console, { ...console, log: () => {} }),
        ),
      );
      expect(remote.requests.length).toBeGreaterThan(0);
      expect(await readFile(join(source, manifest), "utf8")).toBe(remote.bodies.get(manifest));
    },
  );
});

test("BYOR detection compares repository identity, not raw URL spelling", () => {
  expect(
    isRemoteByorSource(normalizeRepositoryUrl("https://github.com/org/machine-config"), "byor"),
  ).toBe(true);
  expect(isRemoteByorSource("https://github.com/org/machine-config", "raw")).toBe(false);
  expect(isRemoteByorSource("https://raw.githubusercontent.com/org/machine-config")).toBe(false);
  expect(isRemoteByorSource("https://github.com/JFALAVA/OUTFITTING.git/")).toBe(false);
  expect(isRemoteByorSource("https://raw.githubusercontent.com/jfalava/outfitting")).toBe(false);
  expect(isRemoteByorSource("https://example.test/mirror")).toBe(false);
});

test.each(["missing", "download", "invalid", "truncated", "symlink", "submodule", "traversal"])(
  "failed %s sync preserves previous source",
  async (failure) => {
    const stateRoot = await tempRoot();
    const remote = remoteFixture("github.com");
    await saveConfigFile(
      { manifest: { baseUrl: "https://github.com/org/machine-config", ref: "feature/desk" } },
      { stateRoot },
    );
    await writeByorProfile({
      stateRoot,
      name: "desk",
      profile: { linux: { apt: { manifest: "packages/apt.txt" }, paths: ["nix"] } },
    });
    const source = sparseSourceRoot(stateRoot);
    await mkdir(source);
    await writeFile(join(source, "keep.txt"), "previous\n");
    const bad = remote.tree.tree[0]!;
    if (failure === "missing") {
      remote.tree.tree.shift();
    }
    if (failure === "download") {
      remote.bodies.delete("nix/modules/host.nix");
    }
    if (failure === "invalid") {
      remote.bodies.set("packages/apt.txt", "");
    }
    if (failure === "truncated") {
      remote.tree.truncated = true;
    }
    if (failure === "symlink") {
      bad.mode = "120000";
    }
    if (failure === "submodule") {
      bad.mode = "160000";
      bad.type = "commit";
    }
    if (failure === "traversal") {
      remote.tree.tree.push({ path: "nix/../../escape", mode: "100644", type: "blob", sha: "bad" });
    }
    await expect(
      syncByorSparseSource({
        config: await loadConfig({ stateRoot }),
        platform: "linux",
        ...remote,
      }),
    ).rejects.toThrow();
    expect(await readFile(join(source, "keep.txt"), "utf8")).toBe("previous\n");
    expect(await readdir(source)).toEqual(["keep.txt"]);
    expect((await readdir(stateRoot)).some((path) => path.startsWith(".outfitting-source-"))).toBe(
      false,
    );
  },
);

test("offline reuses the validated source without GitHub or the edited local map", async () => {
  const stateRoot = await tempRoot();
  const remote = remoteFixture("github.com");
  await saveConfigFile(
    { manifest: { baseUrl: "https://github.com/org/machine-config", ref: "feature/desk" } },
    { stateRoot },
  );
  await writeByorProfile({
    stateRoot,
    name: "desk",
    profile: { linux: { apt: { manifest: "packages/apt.txt" } } },
  });
  const config = await loadConfig({ stateRoot });
  await syncByorSparseSource({ config, platform: "linux", ...remote });
  remote.requests.length = 0;
  await writeByorProfile({
    stateRoot,
    name: "desk",
    profile: { linux: { apt: { manifest: "missing.txt" } } },
  });
  await syncByorSparseSource({ config, platform: "linux", ...remote, offline: true });
  expect(remote.requests).toEqual([]);
  expect(await readFile(join(sparseSourceRoot(stateRoot), "packages/apt.txt"), "utf8")).toBe(
    "curl\njq\n",
  );
});
