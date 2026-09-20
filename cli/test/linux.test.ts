import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Effect } from "effect";
import { afterEach, describe, expect, test, vi } from "vitest";

import * as processCommands from "@/process";

afterEach(() => vi.restoreAllMocks());

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
  applyLinux,
  updateLinux,
} from "@/update/linux";

const execFileAsync = promisify(execFile);
const linuxEntry = fileURLToPath(new URL("../index.ts", import.meta.url));

test("Linux entrypoint registers update nix alongside apt/pacman", async () => {
  const init = await execFileAsync("bun", [linuxEntry, "init", "--help"], {
    encoding: "utf8",
  });
  expect(`${init.stdout}\n${init.stderr}`).toContain("without changing the system");

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
  expect(text).toMatch(/\bnix\b/);
  expect(text).not.toContain("--profile");

  const nixHelp = await execFileAsync("bun", [linuxEntry, "update", "nix", "--help"], {
    encoding: "utf8",
  });
  expect(`${nixHelp.stdout}\n${nixHelp.stderr}`).toMatch(/build|switch|test|dry/);

  const nixSwitchHelp = await execFileAsync(
    "bun",
    [linuxEntry, "update", "nix", "switch", "--help"],
    { encoding: "utf8" },
  );
  expect(`${nixSwitchHelp.stdout}\n${nixSwitchHelp.stderr}`).toContain("--no-refresh");
  expect(`${nixSwitchHelp.stdout}\n${nixSwitchHelp.stderr}`).toContain("--no-push");

  const allHelp = await execFileAsync("bun", [linuxEntry, "update", "all", "--help"], {
    encoding: "utf8",
  });
  expect(`${allHelp.stdout}\n${allHelp.stderr}`).toContain("--no-refresh");
  expect(`${allHelp.stdout}\n${allHelp.stderr}`).toContain("--package-manager");

  // Bare `update nix` must list actions, not activate Home Manager.
  let bareText = "";
  try {
    const bare = await execFileAsync("bun", [linuxEntry, "update", "nix"], { encoding: "utf8" });
    bareText = `${bare.stdout}\n${bare.stderr}`;
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    bareText = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
  }
  expect(bareText).toMatch(/build|switch|test|dry/i);
  expect(bareText).not.toMatch(/Building Home Manager|Activating Home Manager/i);

  const diff = await execFileAsync("bun", [linuxEntry, "diff", "--help"], {
    encoding: "utf8",
  });
  expect(`${diff.stdout}\n${diff.stderr}`).toMatch(/apt|pacman/);
  expect(`${diff.stdout}\n${diff.stderr}`).toContain("--refresh");

  const apply = await execFileAsync("bun", [linuxEntry, "apply", "all", "--help"], {
    encoding: "utf8",
  });
  expect(`${apply.stdout}\n${apply.stderr}`).toContain("Apply the local Linux profile");
  expect(`${apply.stdout}\n${apply.stderr}`).toContain("--refresh");

  const packageUpdateHelp = await execFileAsync("bun", [linuxEntry, "update", "apt", "--help"], {
    encoding: "utf8",
  });
  expect(`${packageUpdateHelp.stdout}\n${packageUpdateHelp.stderr}`).not.toContain("--refresh");
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

test("Linux OCI init materializes the oci-agents sparse source", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-oci-sparse-state-"));
  const calls = vi
    .spyOn(processCommands, "runCommand")
    .mockRejectedValue(new Error("init must not run commands"));
  let sourceRoot: string | undefined;
  let persistedRepoPath: string | undefined;
  let flakeContents: string | undefined;
  let aptManifestContents: string | undefined;
  let persistedProfile: string | undefined;
  try {
    await Effect.runPromise(
      runLinuxInit({
        stateRoot,
        profile: "oci-agents",
        fetcher: async () => new Response("curl\ngit\n"),
      }),
    );
    persistedRepoPath = await readFile(join(stateRoot, "repo-path"), "utf8");
    sourceRoot = await realpath(join(stateRoot, "source"));
    flakeContents = await readFile(join(sourceRoot, "system/oci-agents/flake.nix"), "utf8");
    aptManifestContents = await readFile(join(sourceRoot, "packages/linux/oci-agents.txt"), "utf8");
    persistedProfile = JSON.parse(await readFile(join(stateRoot, "config.json"), "utf8")).linux
      ?.profile;
    await expect(readFile(join(sourceRoot, "packages/macos/Brewfile"), "utf8")).rejects.toThrow();
    await expect(
      readFile(join(sourceRoot, "packages/ubuntu-wsl/apt.txt"), "utf8"),
    ).rejects.toThrow();
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
  }

  expect(sourceRoot).toBeDefined();
  expect(persistedRepoPath).toBe(`${sourceRoot}\n`);
  expect(flakeContents).toBe("curl\ngit\n");
  expect(aptManifestContents).toBe("curl\ngit\n");
  expect(persistedProfile).toBe("oci-agents");
  expect(calls).not.toHaveBeenCalled();
});

test("Linux OCI init persists the repository without bootstrapping Home Manager", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-oci-init-state-"));
  const repo = await mkdtemp(join(tmpdir(), "outfitting-linux-oci-init-repo-"));
  const calls = vi
    .spyOn(processCommands, "runCommand")
    .mockRejectedValue(new Error("init must not run commands"));
  let persistedProfile: string | undefined;
  try {
    await mkdir(join(repo, "system", "oci-agents"), { recursive: true });
    await writeFile(join(repo, "system", "oci-agents", "flake.nix"), "{}\n");
    await writeFile(join(repo, "system", "oci-agents", "bootstrap.sh"), "#!/bin/sh\n");

    await Effect.runPromise(
      runLinuxInit({
        stateRoot,
        repo,
        profile: "oci-agents",
        fetcher: async () => new Response("curl\ngit\n"),
      }),
    );
    persistedProfile = JSON.parse(await readFile(join(stateRoot, "config.json"), "utf8")).linux
      ?.profile;
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
    await rm(repo, { force: true, recursive: true });
  }

  expect(calls).not.toHaveBeenCalled();
  expect(persistedProfile).toBe("oci-agents");
});

test("Linux WSL profile uses its existing Ubuntu package manifest", () => {
  expect(linuxManifestPath("ubuntu-wsl")).toBe("packages/ubuntu-wsl/apt.txt");
});

test("Linux WSL init prepares source without activating Home Manager", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-wsl-init-state-"));
  const repo = await mkdtemp(join(tmpdir(), "outfitting-linux-wsl-init-repo-"));
  const calls = vi
    .spyOn(processCommands, "runCommand")
    .mockRejectedValue(new Error("init must not run commands"));
  let persistedProfile: string | undefined;
  try {
    await mkdir(join(repo, "system", "ubuntu-wsl"), { recursive: true });
    await writeFile(join(repo, "system", "ubuntu-wsl", "flake.nix"), "{}\n");
    await writeFile(join(repo, "system", "ubuntu-wsl", "bootstrap.sh"), "#!/bin/sh\n");

    await Effect.runPromise(
      runLinuxInit({
        stateRoot,
        repo,
        profile: "ubuntu-wsl",
        fetcher: async () => new Response("curl\ngit\n"),
      }),
    );
    persistedProfile = JSON.parse(await readFile(join(stateRoot, "config.json"), "utf8")).linux
      ?.profile;
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
    await rm(repo, { force: true, recursive: true });
  }

  expect(calls).not.toHaveBeenCalled();
  expect(persistedProfile).toBe("ubuntu-wsl");
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

  test("update upgrades installed apt packages without reading a manifest", async () => {
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
          readOsRelease: async () => "ID=ubuntu\n",
          which: async (command) =>
            ({
              apt: "/usr/bin/apt",
              "dpkg-query": "/usr/bin/dpkg-query",
              sudo: "/usr/bin/sudo",
            })[command],
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
    ]);
  });

  test("apply installs missing packages individually and records only successful installs", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-sync-"));
    const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
    try {
      await mkdir(join(stateRoot, "manifests", "packages", "linux"), { recursive: true });
      await writeFile(
        join(stateRoot, "manifests", "packages", "linux", "generic-linux.txt"),
        "curl\ngit\njq\n",
      );
      await Effect.runPromise(
        applyLinux({
          yes: true,
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
          run: async (command, args) => {
            calls.push({ command, args });
            if (command === "/usr/bin/dpkg-query") {
              return {
                code: 0,
                stdout: "curl:amd64\tinstall ok installed\nvim\tinstall ok installed\n",
                stderr: "",
              };
            }
            if (args.includes("jq")) return { code: 1, stdout: "", stderr: "failed" };
            return { code: 0, stdout: "", stderr: "" };
          },
        }),
      ).catch(() => undefined);
      const ownership = JSON.parse(
        await readFile(join(stateRoot, "linux-package-ownership.json"), "utf8"),
      );
      expect(ownership.profiles["generic-linux"].apt).toEqual(["git"]);
    } finally {
      await rm(stateRoot, { force: true, recursive: true });
    }

    expect(calls).toEqual([
      { command: "/usr/bin/dpkg-query", args: ["-W", "-f=${binary:Package}\\t${Status}\\n"] },
      { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "update"] },
      { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "install", "-y", "git"] },
      { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "install", "-y", "jq"] },
    ]);
  });
});

test("Linux prune respects asymmetric profile ownership and requires confirmation", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-prune-"));
  const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
  const config = {
    stateRoot,
    machineId: "test:x86_64-linux",
    machineIdOverridden: true,
    manifest: { baseUrl: "https://unused.invalid", ref: "main" },
  };
  try {
    await mkdir(join(stateRoot, "manifests", "packages", "linux"), { recursive: true });
    await writeFile(
      join(stateRoot, "manifests", "packages", "linux", "generic-linux.txt"),
      "manual\n",
    );
    await writeFile(
      join(stateRoot, "linux-package-ownership.json"),
      `${JSON.stringify({
        version: 1,
        profiles: {
          "generic-linux": { apt: ["shared", "stale-only"] },
          "oci-agents": { apt: ["shared"] },
        },
      })}\n`,
    );
    const run = async (command: string, args: ReadonlyArray<string>) => {
      calls.push({ command, args });
      if (command === "/usr/bin/dpkg-query") {
        return {
          code: 0,
          stdout:
            "manual\tinstall ok installed\nshared\tinstall ok installed\nstale-only\tinstall ok installed\n",
          stderr: "",
        };
      }
      if (args[0] === "-s") return { code: 0, stdout: "Remv stale-only [1.0]\n", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    };
    const common = {
      config,
      profile: "generic-linux",
      packageManager: "apt" as const,
      prune: true,
      which: async (command: string) =>
        ({ apt: "/usr/bin/apt", "dpkg-query": "/usr/bin/dpkg-query", sudo: "/usr/bin/sudo" })[
          command
        ],
      run,
    };

    await Effect.runPromise(applyLinux({ ...common, confirm: Effect.succeed(false) }));
    expect(calls.some(({ args }) => args.includes("remove") && !args.includes("-s"))).toBe(false);
    let ownership = JSON.parse(
      await readFile(join(stateRoot, "linux-package-ownership.json"), "utf8"),
    );
    expect(ownership.profiles["generic-linux"].apt).toEqual(["shared", "stale-only"]);
    expect(ownership.profiles["oci-agents"].apt).toEqual(["shared"]);

    await Effect.runPromise(applyLinux({ ...common, yes: true }));
    ownership = JSON.parse(await readFile(join(stateRoot, "linux-package-ownership.json"), "utf8"));
    expect(ownership.profiles["generic-linux"].apt).toEqual([]);
    expect(calls).toContainEqual({
      command: "/usr/bin/sudo",
      args: ["/usr/bin/apt", "remove", "-y", "stale-only"],
    });
    expect(calls.some(({ args }) => args.includes("manual") || args.includes("shared"))).toBe(
      false,
    );
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
  }
});

test("Linux prune refuses a simulated dependency cascade", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-prune-unsafe-"));
  const calls: ReadonlyArray<string>[] = [];
  try {
    await mkdir(join(stateRoot, "manifests", "packages", "linux"), { recursive: true });
    await writeFile(join(stateRoot, "manifests", "packages", "linux", "generic-linux.txt"), "");
    await writeFile(
      join(stateRoot, "linux-package-ownership.json"),
      `${JSON.stringify({ version: 1, profiles: { "generic-linux": { apt: ["owned"] } } })}\n`,
    );
    await expect(
      Effect.runPromise(
        applyLinux({
          config: {
            stateRoot,
            machineId: "test:x86_64-linux",
            machineIdOverridden: true,
            manifest: { baseUrl: "https://unused.invalid", ref: "main" },
          },
          packageManager: "apt",
          prune: true,
          yes: true,
          which: async (command) =>
            ({ apt: "/usr/bin/apt", "dpkg-query": "/usr/bin/dpkg-query" })[command],
          run: async (command, args) => {
            calls.push(args);
            if (command === "/usr/bin/dpkg-query") {
              return { code: 0, stdout: "owned\tinstall ok installed\n", stderr: "" };
            }
            return { code: 0, stdout: "Remv owned [1]\nRemv dependency [1]\n", stderr: "" };
          },
        }),
      ),
    ).rejects.toThrow("dependency");
    expect(calls.some((args) => args[0] === "remove")).toBe(false);
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
  }
});

test("Linux offline apply uses apt cache only and never updates indexes", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-offline-"));
  const calls: ReadonlyArray<string>[] = [];
  try {
    await mkdir(join(stateRoot, "manifests", "packages", "linux"), { recursive: true });
    await writeFile(
      join(stateRoot, "manifests", "packages", "linux", "generic-linux.txt"),
      "curl\n",
    );
    await Effect.runPromise(
      applyLinux({
        config: {
          stateRoot,
          machineId: "test:x86_64-linux",
          machineIdOverridden: true,
          manifest: { baseUrl: "https://must-not-be-used.invalid", ref: "main" },
        },
        packageManager: "apt",
        offline: true,
        yes: true,
        which: async (command) =>
          ({ apt: "/usr/bin/apt", "dpkg-query": "/usr/bin/dpkg-query", sudo: "/usr/bin/sudo" })[
            command
          ],
        run: async (command, args) => {
          calls.push(args);
          if (command === "/usr/bin/dpkg-query") return { code: 0, stdout: "", stderr: "" };
          return { code: 0, stdout: "", stderr: "" };
        },
      }),
    );
    expect(calls).toContainEqual(["/usr/bin/apt", "install", "--no-download", "-y", "curl"]);
    expect(calls.some((args) => args.includes("update"))).toBe(false);
    expect(() => linuxPackageManagerArgs("pacman", "install", ["curl"], true)).toThrow(
      "Offline pacman installs are refused",
    );
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
  }
});

test("Linux apply refreshes the active sparse profile before planning packages", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-refresh-"));
  const fetched: string[] = [];
  const calls: ReadonlyArray<string>[] = [];
  try {
    await Effect.runPromise(
      applyLinux({
        config: {
          stateRoot,
          machineId: "test:x86_64-linux",
          machineIdOverridden: true,
          manifest: { baseUrl: "https://example.test/outfitting", ref: "main" },
        },
        packageManager: "apt",
        refresh: true,
        yes: true,
        sourceFetcher: async (url) => {
          fetched.push(url);
          return new Response("curl\n");
        },
        which: async (command) =>
          ({ apt: "/usr/bin/apt", "dpkg-query": "/usr/bin/dpkg-query", sudo: "/usr/bin/sudo" })[
            command
          ],
        run: async (command, args) => {
          calls.push(args);
          if (command === "/usr/bin/dpkg-query") return { code: 0, stdout: "", stderr: "" };
          return { code: 0, stdout: "", stderr: "" };
        },
      }),
    );
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
  }

  expect(fetched).toEqual([
    "https://example.test/outfitting/main/packages/linux/generic-linux.txt",
  ]);
  expect(calls).toContainEqual(["/usr/bin/apt", "install", "-y", "curl"]);
});

test("Linux setup applies the cached selected profile", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-setup-"));
  const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
  let fetchCount = 0;
  let persistedProfile: string | undefined;
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
    persistedProfile = JSON.parse(await readFile(join(stateRoot, "config.json"), "utf8")).linux
      ?.profile;
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
  }

  // generic-linux sparse source is a single package list path
  expect(fetchCount).toBe(1);
  expect(persistedProfile).toBe("generic-linux");
  expect(calls).toEqual([
    { command: "/usr/bin/dpkg-query", args: ["-W", "-f=${binary:Package}\\t${Status}\\n"] },
    { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "update"] },
    { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "install", "-y", "curl"] },
    { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "install", "-y", "git"] },
  ]);
});

test("Linux OCI setup preserves the baseline flow and runs the OCI bootstrap", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-oci-state-"));
  const repo = await mkdtemp(join(tmpdir(), "outfitting-linux-oci-repo-"));
  const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
  const repoRoot = await realpath(repo);
  try {
    await mkdir(join(repo, "system", "oci-agents"), { recursive: true });
    await writeFile(join(repo, "system", "oci-agents", "flake.nix"), "{}\n");
    await writeFile(join(repo, "system", "oci-agents", "bootstrap.sh"), "#!/bin/sh\n");
    await mkdir(join(repo, "packages", "linux"), { recursive: true });
    await writeFile(join(repo, "packages", "linux", "oci-agents.txt"), "curl\ngit\n");
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
          if (command === "/usr/bin/dpkg-query") {
            return { code: 0, stdout: "", stderr: "" };
          }
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
    { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "install", "-y", "curl"] },
    { command: "/usr/bin/sudo", args: ["/usr/bin/apt", "install", "-y", "git"] },
    {
      command: "bash",
      args: [join(repoRoot, "system", "oci-agents", "bootstrap.sh")],
    },
  ]);
});

test("Linux shares only proven ownership and bare apply retains stale packages", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-shared-"));
  const config = {
    stateRoot,
    machineId: "test:linux",
    machineIdOverridden: true,
    manifest: { baseUrl: "https://unused.invalid", ref: "main" },
  };
  const installed = new Set(["manual"]);
  const calls: string[][] = [];
  const run = async (command: string, args: ReadonlyArray<string>) => {
    calls.push([...args]);
    if (command === "dpkg-query")
      return {
        code: 0,
        stdout: [...installed].map((name) => `${name}\tinstall ok installed`).join("\n"),
        stderr: "",
      };
    if (args[0] === "install") installed.add(args.at(-1)!);
    if (args[0] === "-s")
      return {
        code: 0,
        stdout: args
          .slice(2)
          .map((name) => `Remv ${name} [1]`)
          .join("\n"),
        stderr: "",
      };
    if (args[0] === "remove") args.slice(2).forEach((name) => installed.delete(name));
    return { code: 0, stdout: "", stderr: "" };
  };
  const common = {
    config,
    packageManager: "apt" as const,
    yes: true,
    run,
    which: async (name: string) => (name === "sudo" ? undefined : name),
  };
  try {
    await mkdir(join(stateRoot, "manifests/packages/linux"), { recursive: true });
    const base = join(stateRoot, "manifests/packages/linux/generic-linux.txt");
    const oci = join(stateRoot, "manifests/packages/linux/oci-agents.txt");
    await writeFile(base, "shared\nmanual\n");
    await writeFile(oci, "shared\nmanual\n");
    await Effect.runPromise(applyLinux({ ...common, profile: "generic-linux" }));
    await Effect.runPromise(applyLinux({ ...common, profile: "oci-agents" }));
    await writeFile(base, "");
    await Effect.runPromise(applyLinux({ ...common, profile: "generic-linux", prune: true }));
    expect(installed).toEqual(new Set(["manual", "shared"]));
    await writeFile(oci, "");
    await Effect.runPromise(applyLinux({ ...common, profile: "oci-agents" }));
    expect(calls.some((args) => args[0] === "remove")).toBe(false);
    await Effect.runPromise(applyLinux({ ...common, profile: "oci-agents", prune: true }));
    expect(installed).toEqual(new Set(["manual"]));
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test.each(["-y", "--allow-remove-essential", "foo*", "../foo", "foo;bar"])(
  "Linux rejects unsafe manifest entry %s",
  (entry) => {
    expect(() => parseLinuxPackageManifest(entry)).toThrow("Invalid Linux package entry");
  },
);
