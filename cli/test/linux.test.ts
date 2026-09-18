import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import {
  detectLinuxPackageManager,
  linuxDistributionFamily,
  parseOsRelease,
} from "@/platform/linux";
import { runLinuxInit, runLinuxSetup } from "@/setup/linux";
import {
  linuxManifestPath,
  linuxPackageIdentity,
  linuxPackageManagerArgs,
  listInstalledLinuxPackages,
  missingLinuxPackages,
  parseLinuxPackageManifest,
  syncLinux,
  updateLinux,
} from "@/update/linux";

const execFileAsync = promisify(execFile);
const linuxEntry = fileURLToPath(new URL("../index.ts", import.meta.url));

test("Linux entrypoint registers the distro-agnostic update commands", async () => {
  const init = await execFileAsync("bun", [linuxEntry, "init", "--help"], {
    encoding: "utf8",
  });
  expect(`${init.stdout}\n${init.stderr}`).toContain("without changing packages");

  const setup = await execFileAsync("bun", [linuxEntry, "setup", "--help"], {
    encoding: "utf8",
  });
  expect(`${setup.stdout}\n${setup.stderr}`).toContain("apply the selected Linux package profile");

  const result = await execFileAsync("bun", [linuxEntry, "update", "--help"], {
    encoding: "utf8",
  });
  const text = `${result.stdout}\n${result.stderr}`;
  expect(text).toMatch(/\ball\b/);
  expect(text).toMatch(/\bapt\b/);
  expect(text).toMatch(/\bpacman\b/);
  expect(text).toContain("--package-manager");

  const diff = await execFileAsync("bun", [linuxEntry, "diff", "--help"], {
    encoding: "utf8",
  });
  expect(`${diff.stdout}\n${diff.stderr}`).toMatch(/apt|pacman/);

  const sync = await execFileAsync("bun", [linuxEntry, "sync", "--help"], {
    encoding: "utf8",
  });
  expect(`${sync.stdout}\n${sync.stderr}`).toMatch(/apt|pacman/);
});

test("Linux init materializes state without invoking a package manager", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-init-"));
  try {
    const result = await execFileAsync("bun", [linuxEntry, "init", "--no-fetch"], {
      encoding: "utf8",
      env: { ...process.env, OUTFITTING_STATE_ROOT: stateRoot },
    });
    expect(`${result.stdout}\n${result.stderr}`).toContain(`State root ready: ${stateRoot}`);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Next: outfitting-manager setup");
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
  }
});

test("Linux OCI init materializes the complete sparse source", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-oci-sparse-state-"));
  const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
  let sourceRoot: string | undefined;
  let persistedRepoPath: string | undefined;
  let flakeContents: string | undefined;
  let aptManifestContents: string | undefined;
  try {
    await Effect.runPromise(
      runLinuxInit({
        stateRoot,
        profile: "oci-agents",
        fetcher: async () => new Response("curl\ngit\n"),
        run: async (command, args) => {
          calls.push({ command, args });
          return { code: 0, stdout: "", stderr: "" };
        },
      }),
    );
    persistedRepoPath = await readFile(join(stateRoot, "repo-path"), "utf8");
    sourceRoot = await realpath(join(stateRoot, "source"));
    flakeContents = await readFile(join(sourceRoot, "system/oci-agents/flake.nix"), "utf8");
    aptManifestContents = await readFile(join(sourceRoot, "packages/ubuntu-wsl/apt.txt"), "utf8");
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
  }

  expect(sourceRoot).toBeDefined();
  expect(persistedRepoPath).toBe(`${sourceRoot}\n`);
  expect(flakeContents).toBe("curl\ngit\n");
  expect(aptManifestContents).toBe("curl\ngit\n");
  expect(calls).toEqual([
    {
      command: "bash",
      args: [join(sourceRoot!, "system", "oci-agents", "bootstrap.sh")],
    },
  ]);
});

test("Linux OCI init bootstraps Home Manager after persisting the repository", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-oci-init-state-"));
  const repo = await mkdtemp(join(tmpdir(), "outfitting-linux-oci-init-repo-"));
  const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
  const repoRoot = await realpath(repo);
  try {
    await mkdir(join(repo, "system", "macos"), { recursive: true });
    await mkdir(join(repo, "system", "oci-agents"), { recursive: true });
    await writeFile(join(repo, "system", "macos", "flake.nix"), "{}\n");
    await writeFile(join(repo, "system", "oci-agents", "bootstrap.sh"), "#!/bin/sh\n");

    await Effect.runPromise(
      runLinuxInit({
        stateRoot,
        repo,
        profile: "oci-agents",
        fetcher: async () => new Response("curl\ngit\n"),
        run: async (command, args) => {
          calls.push({ command, args });
          return { code: 0, stdout: "", stderr: "" };
        },
      }),
    );
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
    await rm(repo, { force: true, recursive: true });
  }

  expect(calls).toEqual([
    {
      command: "git",
      args: ["-C", repo, "status", "--porcelain"],
    },
    {
      command: "git",
      args: ["-C", repo, "fetch", "--prune", "origin", "main"],
    },
    {
      command: "git",
      args: ["-C", repo, "checkout", "--detach", "FETCH_HEAD"],
    },
    {
      command: "bash",
      args: [join(repoRoot, "system", "oci-agents", "bootstrap.sh")],
    },
  ]);
});

test("Linux WSL profile uses its existing Ubuntu package manifest", () => {
  expect(linuxManifestPath("ubuntu-wsl")).toBe("packages/ubuntu-wsl/apt.txt");
});

test("Linux WSL init bootstraps the Ubuntu Home Manager configuration", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-wsl-init-state-"));
  const repo = await mkdtemp(join(tmpdir(), "outfitting-linux-wsl-init-repo-"));
  const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
  const repoRoot = await realpath(repo);
  try {
    await mkdir(join(repo, "system", "macos"), { recursive: true });
    await mkdir(join(repo, "system", "ubuntu-wsl"), { recursive: true });
    await writeFile(join(repo, "system", "macos", "flake.nix"), "{}\n");
    await writeFile(join(repo, "system", "ubuntu-wsl", "bootstrap.sh"), "#!/bin/sh\n");

    await Effect.runPromise(
      runLinuxInit({
        stateRoot,
        repo,
        profile: "ubuntu-wsl",
        fetcher: async () => new Response("curl\ngit\n"),
        run: async (command, args) => {
          calls.push({ command, args });
          return { code: 0, stdout: "", stderr: "" };
        },
      }),
    );
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
    await rm(repo, { force: true, recursive: true });
  }

  expect(calls).toEqual([
    {
      command: "git",
      args: ["-C", repo, "status", "--porcelain"],
    },
    {
      command: "git",
      args: ["-C", repo, "fetch", "--prune", "origin", "main"],
    },
    {
      command: "git",
      args: ["-C", repo, "checkout", "--detach", "FETCH_HEAD"],
    },
    {
      command: "bash",
      args: [join(repoRoot, "system", "ubuntu-wsl", "bootstrap.sh")],
    },
  ]);
});

describe("Linux host detection", () => {
  test("parses quoted os-release values and identifies Debian family", () => {
    const release = parseOsRelease('ID="ubuntu"\nID_LIKE="debian"\n');
    expect(release).toEqual({ ID: "ubuntu", ID_LIKE: "debian" });
    expect(linuxDistributionFamily('ID="ubuntu"\nID_LIKE="debian"\n')).toBe("debian");
  });

  test("identifies Arch family and honors an explicit executable override", async () => {
    expect(linuxDistributionFamily("ID=manjaro\n")).toBe("arch");
    await expect(
      detectLinuxPackageManager({
        requested: "pacman",
        readOsRelease: async () => {
          throw new Error("missing in test");
        },
        which: async (command) => (command === "pacman" ? "/usr/bin/pacman" : undefined),
      }),
    ).resolves.toBe("pacman");
  });

  test("uses the distro family instead of silently switching managers", async () => {
    const checked: string[] = [];
    await expect(
      detectLinuxPackageManager({
        readOsRelease: async () => "ID=ubuntu\n",
        which: async (command) => {
          checked.push(command);
          return command === "pacman" ? "/usr/bin/pacman" : undefined;
        },
      }),
    ).rejects.toThrow("apt");
    expect(checked).toEqual(["apt"]);
  });

  test("uses an installed manager when the distro family is unknown", async () => {
    await expect(
      detectLinuxPackageManager({
        readOsRelease: async () => "ID=alpine\n",
        which: async (command) => (command === "pacman" ? "/usr/bin/pacman" : undefined),
      }),
    ).resolves.toBe("pacman");
  });
});

describe("Linux package adapter", () => {
  test("parses comments, blank lines, inline comments, and duplicate entries", () => {
    expect(parseLinuxPackageManifest(`\n# baseline\ncurl\ngit # source control\ncurl\n`)).toEqual([
      "curl",
      "git",
    ]);
  });

  test("builds native apt and pacman operations without apt-get", () => {
    expect(linuxPackageManagerArgs("apt", "update")).toEqual(["update"]);
    expect(linuxPackageManagerArgs("apt", "install", ["curl", "git"])).toEqual([
      "install",
      "-y",
      "curl",
      "git",
    ]);
    expect(linuxPackageManagerArgs("apt", "remove", ["git"])).toEqual(["remove", "-y", "git"]);
    expect(linuxPackageManagerArgs("pacman", "upgrade")).toEqual(["-Syu", "--noconfirm"]);
    expect(linuxPackageManagerArgs("pacman", "install", ["curl"])).toEqual([
      "-S",
      "--needed",
      "--noconfirm",
      "curl",
    ]);
  });

  test("checks declared package presence without treating unrelated installs as extras", async () => {
    expect(linuxPackageIdentity("curl:amd64=8.5.0")).toBe("curl");
    expect(missingLinuxPackages(["curl", "git", "git"], new Set(["curl", "vim"]))).toEqual(["git"]);

    const installed = await listInstalledLinuxPackages("apt", {
      which: async (command) => (command === "dpkg-query" ? "/usr/bin/dpkg-query" : undefined),
      run: async () => ({
        code: 0,
        stdout: "curl:amd64\tinstall ok installed\nold-package\tdeinstall ok config-files\n",
        stderr: "",
      }),
    });
    expect(installed).toEqual(new Set(["curl"]));
  });

  test("updates an apt host from the selected profile manifest", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-update-"));
    const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
    try {
      await Effect.runPromise(
        updateLinux({
          config: {
            stateRoot,
            machineId: "test:x86_64-linux",
            machineIdOverridden: true,
            manifest: { baseUrl: "https://example.test/outfitting", ref: "main" },
          },
          profile: "generic-linux",
          readOsRelease: async () => "ID=ubuntu\n",
          which: async (command) => ({ apt: "/usr/bin/apt", sudo: "/usr/bin/sudo" })[command],
          fetcher: async () => new Response("curl\ngit\n"),
          run: async (command, args) => {
            calls.push({ command, args });
            return { code: 0, stdout: "", stderr: "" };
          },
        }),
      );
    } finally {
      await rm(stateRoot, { force: true, recursive: true });
    }

    expect(calls).toEqual([
      { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "update"] },
      { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "upgrade", "-y"] },
      {
        command: "/usr/bin/sudo",
        args: ["/usr/bin/apt", "install", "-y", "curl", "git"],
      },
    ]);
  });

  test("syncs only missing apt packages and never upgrades or removes extras", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-sync-"));
    const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
    try {
      await Effect.runPromise(
        syncLinux({
          config: {
            stateRoot,
            machineId: "test:x86_64-linux",
            machineIdOverridden: true,
            manifest: { baseUrl: "https://example.test/outfitting", ref: "main" },
          },
          packageManager: "apt",
          readOsRelease: async () => "ID=ubuntu\n",
          which: async (command) =>
            ({
              apt: "/usr/bin/apt",
              "dpkg-query": "/usr/bin/dpkg-query",
              sudo: "/usr/bin/sudo",
            })[command],
          fetcher: async () => new Response("curl\ngit\n"),
          run: async (command, args) => {
            calls.push({ command, args });
            if (command === "/usr/bin/dpkg-query") {
              return {
                code: 0,
                stdout: "curl:amd64\tinstall ok installed\nvim\tinstall ok installed\n",
                stderr: "",
              };
            }
            return { code: 0, stdout: "", stderr: "" };
          },
        }),
      );
    } finally {
      await rm(stateRoot, { force: true, recursive: true });
    }

    expect(calls).toEqual([
      { command: "/usr/bin/dpkg-query", args: ["-W", "-f=${binary:Package}\\t${Status}\\n"] },
      { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "update"] },
      { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "install", "-y", "git"] },
    ]);
  });
});

test("Linux setup applies the cached selected profile", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-setup-"));
  const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
  let fetchCount = 0;
  try {
    await Effect.runPromise(
      runLinuxSetup({
        stateRoot,
        profile: "generic-linux",
        packageManager: "apt",
        readOsRelease: async () => "ID=ubuntu\n",
        which: async (command) =>
          ({
            apt: "/usr/bin/apt",
            "dpkg-query": "/usr/bin/dpkg-query",
            sudo: "/usr/bin/sudo",
          })[command],
        fetcher: async () => {
          fetchCount += 1;
          return new Response("curl\ngit\n");
        },
        run: async (command, args) => {
          calls.push({ command, args });
          if (command === "/usr/bin/dpkg-query") {
            return { code: 0, stdout: "", stderr: "" };
          }
          return { code: 0, stdout: "", stderr: "" };
        },
      }),
    );
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
  }

  expect(fetchCount).toBe(1);
  expect(calls).toEqual([
    { command: "/usr/bin/dpkg-query", args: ["-W", "-f=${binary:Package}\\t${Status}\\n"] },
    { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "update"] },
    { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "install", "-y", "curl", "git"] },
  ]);
});

test("Linux OCI setup preserves the baseline flow and runs the OCI bootstrap", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-oci-state-"));
  const repo = await mkdtemp(join(tmpdir(), "outfitting-linux-oci-repo-"));
  const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
  const repoRoot = await realpath(repo);
  try {
    await mkdir(join(repo, "system", "macos"), { recursive: true });
    await mkdir(join(repo, "system", "oci-agents"), { recursive: true });
    await writeFile(join(repo, "system", "macos", "flake.nix"), "{}\n");
    await writeFile(join(repo, "system", "oci-agents", "bootstrap.sh"), "#!/bin/sh\n");
    await Effect.runPromise(
      runLinuxSetup({
        stateRoot,
        repo,
        profile: "oci-agents",
        packageManager: "apt",
        readOsRelease: async () => "ID=ubuntu\n",
        which: async (command) =>
          ({
            apt: "/usr/bin/apt",
            "dpkg-query": "/usr/bin/dpkg-query",
            sudo: "/usr/bin/sudo",
          })[command],
        fetcher: async () => new Response("curl\ngit\n"),
        run: async (command, args) => {
          calls.push({ command, args });
          return { code: 0, stdout: "", stderr: "" };
        },
      }),
    );
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
    await rm(repo, { force: true, recursive: true });
  }

  expect(calls).toEqual([
    { command: "/usr/bin/dpkg-query", args: ["-W", "-f=${binary:Package}\\t${Status}\\n"] },
    { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "update"] },
    { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "install", "-y", "curl", "git"] },
    {
      command: "bash",
      args: [join(repoRoot, "system", "oci-agents", "bootstrap.sh")],
    },
  ]);
});
