import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { Console, Effect } from "effect";
import { afterEach, describe, expect, test, vi } from "vitest";

import { initializeWindows } from "@/commands/setup/windows";
import { configFilePath, loadConfig, normalizeGitRepository, sparseSourceRoot } from "@/config";
import type { ManifestFetcher } from "@/fetch";
import { classifyGitHubRepository, readGitHubBlobs } from "@/fetch/github";
import { runCommand as executeCommand } from "@/process";
import type { runCommand } from "@/process";
import { runLinuxInit } from "@/setup/linux";
import { runSetup } from "@/setup/run";
import { syncByorSparseSource } from "@/setup/source";
import { readWindowsLock } from "@/update/windows-lock";

const temps: string[] = [];
const execFileAsync = promisify(execFile);

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
      transport: "raw",
      baseUrl: "https://raw.githubusercontent.com/org/machine-config",
    });
    expect(normalizeGitRepository("https://github.com/org/machine-config")).toBe(
      "https://github.com/org/machine-config",
    );

    const enterprise = classifyGitHubRepository("https://github.example.com/org/machine-config");
    expect(enterprise).toMatchObject({
      host: "github.example.com",
      owner: "org",
      name: "machine-config",
      transport: "gh",
    });
    expect(enterprise?.baseUrl).not.toContain("raw.githubusercontent.com");
    expect(normalizeGitRepository("https://github.example.com/org/machine-config")).toBe(
      "https://github.example.com/org/machine-config",
    );
    expect(normalizeGitRepository("git@code.example.com:team/machine-config.git")).toBe(
      "git@code.example.com:team/machine-config.git",
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
    "%s init uses TOML declarations and materializes selected files",
    async (platform) => {
      for (const key of ["OUTFITTING_REPO"]) {
        vi.stubEnv(key, "");
      }
      const stateRoot = await tempRoot();
      const remote = remoteFixture(host);
      await writeFile(
        configFilePath(stateRoot),
        `schema = 1\n[source]\nrepository = "https://${host}/org/machine-config"\nref = "feature/desk"\n[${platform}]\n${platform === "windows" ? 'profiles = ["desk"]' : 'profile = "desk"'}\n[profiles.desk.${platform}.${platform === "windows" ? "winget" : platform === "macos" ? "nix" : "apt"}]\n${platform === "windows" ? 'manifest = "packages/windows.txt"' : platform === "macos" ? 'flake = "nix"\nattribute = "darwinConfigurations.desk.system"' : 'manifest = "packages/apt.txt"'}\n[profiles.unselected.linux.nix]\nflake = "absent"\nattribute = "homeConfigurations.other.activationPackage"\n`,
      );
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
      await expect(readFile(join(source, "outfitting.json"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(Object.keys((await loadConfig({ stateRoot })).declarations!.profiles)).toEqual([
        "desk",
        "unselected",
      ]);
      if (platform === "macos") {
        expect(await readFile(join(source, "nix/modules/host.nix"), "utf8")).toBe(
          "{ programs.zsh.enable = true; }\n",
        );
        expect(await readFile(join(source, "nix/flake.lock"), "utf8")).toBe(
          '{"version":7,"nodes":{}}\n',
        );
        expect((await stat(join(source, "nix/run.sh"))).mode & 0o111).not.toBe(0);
      } else if (platform === "windows") {
        expect((await readWindowsLock(await loadConfig({ stateRoot }))).profiles).toEqual([]);
      } else {
        await expect(readFile(join(source, "nix/modules/host.nix"), "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
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

test("BYOR accepts Git repository URLs without converting them into raw-content URLs", () => {
  expect(normalizeGitRepository("https://github.com/org/machine-config")).toBe(
    "https://github.com/org/machine-config",
  );
  expect(normalizeGitRepository("ssh://git@code.example.com/team/config.git")).toBe(
    "ssh://git@code.example.com/team/config.git",
  );
  expect(normalizeGitRepository("git@code.example.com:team/config.git")).toBe(
    "git@code.example.com:team/config.git",
  );
});

test.each([
  "https://git.example.com/team/machine-config.git",
  "git@git.example.com:team/machine-config.git",
])("generic Git transport fetches one revision for %s", async (repository) => {
  const root = await tempRoot();
  const remoteRoot = join(root, "remote.git");
  const stateRoot = join(root, "state");
  await mkdir(join(remoteRoot, "packages", "custom"), { recursive: true });
  await mkdir(join(remoteRoot, "packages", "unselected"), { recursive: true });
  await writeFile(join(remoteRoot, "packages", "custom", "apt.txt"), "curl\n");
  await writeFile(join(remoteRoot, "packages", "unselected", "apt.txt"), "vim\n");
  await execFileAsync("git", ["init", "--quiet", "--initial-branch=main", remoteRoot]);
  await execFileAsync("git", ["-C", remoteRoot, "config", "user.name", "BYOR test"]);
  await execFileAsync("git", ["-C", remoteRoot, "config", "user.email", "byor@example.test"]);
  await execFileAsync("git", ["-C", remoteRoot, "add", "."]);
  await execFileAsync("git", ["-C", remoteRoot, "commit", "--quiet", "-m", "BYOR fixture"]);
  const revision = (
    await execFileAsync("git", ["-C", remoteRoot, "rev-parse", "HEAD"], { encoding: "utf8" })
  ).stdout.trim();

  await mkdir(stateRoot);
  await writeFile(
    configFilePath(stateRoot),
    `schema = 1\n[source]\nrepository = "${repository}"\nref = "main"\n[linux]\nprofile = "custom-linux"\n[profiles.custom-linux.linux.apt]\nmanifest = "packages/custom/apt.txt"\n`,
  );
  const gitCalls: string[][] = [];
  const run: typeof runCommand = async (command, args, options) => {
    expect(command).toBe("git");
    const actualArgs = [...args];
    gitCalls.push([...args]);
    if (actualArgs[0] === "remote" && actualArgs[1] === "add") {
      actualArgs[3] = remoteRoot;
    }
    return executeCommand(command, actualArgs, options);
  };

  await syncByorSparseSource({
    config: await loadConfig({ stateRoot }),
    platform: "linux",
    profile: "custom-linux",
    run,
  });

  expect(gitCalls.find((args) => args[0] === "remote" && args[1] === "add")).toEqual([
    "remote",
    "add",
    "origin",
    repository,
  ]);
  expect(gitCalls.filter((args) => args[0] === "fetch")).toHaveLength(1);
  expect(gitCalls.filter((args) => args[0] === "rev-parse")).toEqual([
    ["rev-parse", "--verify", "FETCH_HEAD^{commit}"],
  ]);
  expect(gitCalls.filter((args) => args[0] === "ls-tree")[0]).toContain(revision);
  expect(gitCalls.filter((args) => args[0] === "checkout")[0]).toEqual([
    "checkout",
    revision,
    "--",
    "packages/custom/apt.txt",
  ]);
  expect(await readFile(join(sparseSourceRoot(stateRoot), "packages/custom/apt.txt"), "utf8")).toBe(
    "curl\n",
  );
  await expect(
    readFile(join(sparseSourceRoot(stateRoot), "packages/unselected/apt.txt"), "utf8"),
  ).rejects.toMatchObject({ code: "ENOENT" });
  const metadata = JSON.parse(
    await readFile(join(sparseSourceRoot(stateRoot), ".outfitting-source.json"), "utf8"),
  );
  expect(metadata).toMatchObject({
    format: "outfitting-source-v1",
    repository,
    ref: "main",
    revision,
    declarationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
});

test.each(["missing", "download", "invalid", "truncated", "symlink", "submodule", "traversal"])(
  "failed %s sync preserves previous source",
  async (failure) => {
    const stateRoot = await tempRoot();
    const remote = remoteFixture("github.com");
    await writeFile(
      configFilePath(stateRoot),
      'schema = 1\n[source]\nrepository = "https://github.com/org/machine-config"\nref = "feature/desk"\n[linux]\nprofile = "desk"\n[profiles.desk.linux]\npaths = ["nix"]\n[profiles.desk.linux.apt]\nmanifest = "packages/apt.txt"\n',
    );
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

test("offline hashes selected declarations, reuses the source, and rejects changed declarations", async () => {
  const stateRoot = await tempRoot();
  const remote = remoteFixture("github.com");
  await writeFile(
    configFilePath(stateRoot),
    'schema = 1\n[source]\nrepository = "https://github.com/org/machine-config"\nref = "feature/desk"\n[linux]\nprofile = "desk"\n[profiles.desk.linux.apt]\nmanifest = "packages/apt.txt"\n[profiles.other.linux.apt]\nmanifest = "packages/other.txt"\n',
  );
  const config = await loadConfig({ stateRoot });
  await syncByorSparseSource({ config, platform: "linux", ...remote });
  remote.requests.length = 0;
  await syncByorSparseSource({ config, platform: "linux", ...remote, offline: true });
  expect(remote.requests).toEqual([]);
  expect(await readFile(join(sparseSourceRoot(stateRoot), "packages/apt.txt"), "utf8")).toBe(
    "curl\njq\n",
  );
  await writeFile(
    configFilePath(stateRoot),
    'schema = 1\n[source]\nrepository = "https://github.com/org/machine-config"\nref = "feature/desk"\n[linux]\nprofile = "desk"\n[profiles.desk.linux.apt]\nmanifest = "packages/apt.txt"\n[profiles.other.linux.apt]\nmanifest = "changed.txt"\n',
  );
  await syncByorSparseSource({
    config: await loadConfig({ stateRoot }),
    platform: "linux",
    ...remote,
    offline: true,
  });
  await writeFile(
    configFilePath(stateRoot),
    'schema = 1\n[source]\nrepository = "https://github.com/org/machine-config"\nref = "feature/desk"\n[linux]\nprofile = "desk"\n[profiles.desk.linux.apt]\nmanifest = "missing.txt"\n[profiles.other.linux.apt]\nmanifest = "changed.txt"\n',
  );
  await expect(
    syncByorSparseSource({
      config: await loadConfig({ stateRoot }),
      platform: "linux",
      ...remote,
      offline: true,
    }),
  ).rejects.toThrow(/cached source does not match/);
});
