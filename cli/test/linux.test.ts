import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  applyLinux,
  linuxPackageIdentity,
  linuxPackageManagerArgs,
  listInstalledLinuxPackages,
  missingLinuxPackages,
  parseLinuxPackageManifest,
  updateLinux,
} from "@/update/linux";

const execFileAsync = promisify(execFile);
const linuxEntry = fileURLToPath(new URL("../index.ts", import.meta.url));

async function createLinuxRepo(
  stateRoot: string,
  profiles: Record<string, { apt?: string; pacman?: string }>,
) {
  const repo = await mkdtemp(join(tmpdir(), "outfitting-linux-byor-repo-"));
  const toml = [
    "schema = 1",
    "",
    "[source]",
    `path = ${JSON.stringify(repo)}`,
    "",
    "[linux]",
    `profile = ${JSON.stringify(Object.keys(profiles)[0])}`,
  ];

  await mkdir(repo, { recursive: true });
  for (const [profile, declarations] of Object.entries(profiles)) {
    const linux: Record<string, { manifest: string }> = {};
    for (const [manager, content] of Object.entries(declarations)) {
      if (content === undefined) continue;
      const manifest = `packages/${profile}/${manager}.txt`;
      await mkdir(join(repo, "packages", profile), { recursive: true });
      await writeFile(join(repo, manifest), content);
      linux[manager] = { manifest };
    }
    for (const [manager, declaration] of Object.entries(linux)) {
      toml.push(
        "",
        `[profiles.${JSON.stringify(profile)}.linux.${manager}]`,
        `manifest = ${JSON.stringify(declaration.manifest)}`,
      );
    }
  }
  await mkdir(stateRoot, { recursive: true });
  await writeFile(join(stateRoot, "config.toml"), `${toml.join("\n")}\n`);
  return repo;
}

function managerTools(calls: Array<{ command: string; args: ReadonlyArray<string> }>) {
  return {
    packageManager: "apt" as const,
    readOsRelease: async () => "ID=ubuntu\n",
    which: async (command: string) =>
      ({
        apt: "/usr/bin/apt",
        "dpkg-query": "/usr/bin/dpkg-query",
        sudo: "/usr/bin/sudo",
      })[command],
    run: async (command: string, args: ReadonlyArray<string>) => {
      calls.push({ command, args });
      if (command === "/usr/bin/dpkg-query") {
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    },
  };
}

test("Linux commands expose BYOR source options instead of manifest URL/ref defaults", async () => {
  const init = await execFileAsync("bun", [linuxEntry, "init", "--help"], {
    encoding: "utf8",
  });
  const initHelp = `${init.stdout}\n${init.stderr}`;
  expect(initHelp).toContain("--profile");
  expect(initHelp).toContain("--repo");
  expect(initHelp).not.toContain("manifest-base-url");
  expect(initHelp).not.toContain("manifest-ref");

  const setup = await execFileAsync("bun", [linuxEntry, "setup", "--help"], {
    encoding: "utf8",
  });
  const setupHelp = `${setup.stdout}\n${setup.stderr}`;
  expect(setupHelp).toContain("--profile");
  expect(setupHelp).toContain("--repo");
  expect(setupHelp).toContain("--package-manager");
});

test("Linux init requires a selected source and does not invent a default profile", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-init-empty-"));
  try {
    await expect(
      Effect.runPromise(runLinuxInit({ stateRoot, profile: "workstation" })),
    ).rejects.toThrow(/No profile declarations are configured/);
    await expect(readFile(join(stateRoot, "config.toml"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
  }
});

test("Linux init validates and persists a selected local BYOR checkout without applying packages", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-init-"));
  const repo = await createLinuxRepo(stateRoot, { "workstation-v2": { apt: "curl\n" } });
  try {
    await Effect.runPromise(runLinuxInit({ stateRoot, repo, profile: "workstation-v2" }));

    const config = await readFile(join(stateRoot, "config.toml"), "utf8");
    expect(config).toContain('profile = "workstation-v2"');
    expect(config).toContain(`path = ${JSON.stringify(repo)}`);
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
    await rm(repo, { force: true, recursive: true });
  }
});

describe("Linux host detection", () => {
  test("parses quoted os-release values and identifies Debian family", () => {
    const release = parseOsRelease('ID="ubuntu"\nID_LIKE="debian"\n');
    expect(release).toEqual({ ID: "ubuntu", ID_LIKE: "debian" });
    expect(linuxDistributionFamily('ID="ubuntu"\nID_LIKE="debian"\n')).toBe("debian");
  });

  test("honors an explicit executable override and does not silently switch distro managers", async () => {
    await expect(
      detectLinuxPackageManager({
        requested: "pacman",
        readOsRelease: async () => "ID=ubuntu\n",
        which: async (command) => (command === "pacman" ? "/usr/bin/pacman" : undefined),
      }),
    ).resolves.toBe("pacman");

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
});

describe("Linux package adapter", () => {
  test("parses and validates package declarations", () => {
    expect(parseLinuxPackageManifest("\n# baseline\ncurl\ngit # source control\ncurl\n")).toEqual([
      "curl",
      "git",
    ]);
    expect(() => parseLinuxPackageManifest("foo;bar")).toThrow("Invalid Linux package entry");
  });

  test("builds native apt and pacman operations", () => {
    expect(linuxPackageManagerArgs("apt", "update")).toEqual(["update"]);
    expect(linuxPackageManagerArgs("apt", "install", ["curl", "git"], true)).toEqual([
      "install",
      "--no-download",
      "-y",
      "curl",
      "git",
    ]);
    expect(linuxPackageManagerArgs("pacman", "upgrade")).toEqual(["-Syu", "--noconfirm"]);
    expect(() => linuxPackageManagerArgs("pacman", "install", ["curl"], true)).toThrow(
      "Offline pacman installs are refused",
    );
  });

  test("normalizes package identities and inventories only installed apt packages", async () => {
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

  test("Linux update upgrades installed packages without requiring BYOR configuration", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-update-"));
    const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
    try {
      await Effect.runPromise(
        updateLinux({
          config: {
            configPath: join(stateRoot, "config.toml"),
            stateRoot,
            machineId: "test:x86_64-linux",
            machineIdOverridden: true,
          },
          readOsRelease: async () => "ID=ubuntu\n",
          which: async (command) => ({ apt: "/usr/bin/apt", sudo: "/usr/bin/sudo" })[command],
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

  test("Linux setup installs only the selected BYOR profile's apt declaration", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-setup-"));
    const repo = await createLinuxRepo(stateRoot, {
      "workstation-v2": { apt: "curl\ngit\n" },
      "other-profile": { apt: "vim\n" },
    });
    const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
    let fetchCount = 0;
    const configBefore = await readFile(join(stateRoot, "config.toml"), "utf8");
    try {
      await Effect.runPromise(
        runLinuxSetup({
          stateRoot,
          repo,
          ...managerTools(calls),
          fetcher: async () => {
            fetchCount += 1;
            throw new Error("local BYOR checkout must not be fetched");
          },
        }),
      );
      expect(await readFile(join(stateRoot, "config.toml"), "utf8")).toBe(configBefore);
    } finally {
      await rm(stateRoot, { force: true, recursive: true });
      await rm(repo, { force: true, recursive: true });
    }

    expect(fetchCount).toBe(0);
    expect(calls).toContainEqual({
      command: "/usr/bin/sudo",
      args: ["/usr/bin/apt", "install", "-y", "curl"],
    });
    expect(calls).toContainEqual({
      command: "/usr/bin/sudo",
      args: ["/usr/bin/apt", "install", "-y", "git"],
    });
    expect(calls.some(({ args }) => args.includes("vim"))).toBe(false);
  });

  test("a profile override applies only for the invocation and leaves TOML unchanged", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-profile-override-"));
    const repo = await createLinuxRepo(stateRoot, {
      "workstation-v2": { apt: "curl\n" },
      "other-profile": { apt: "vim\n" },
    });
    const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
    const configBefore = await readFile(join(stateRoot, "config.toml"), "utf8");
    try {
      await Effect.runPromise(
        runLinuxSetup({
          stateRoot,
          repo,
          profile: "other-profile",
          ...managerTools(calls),
        }),
      );
      expect(await readFile(join(stateRoot, "config.toml"), "utf8")).toBe(configBefore);
    } finally {
      await rm(stateRoot, { force: true, recursive: true });
      await rm(repo, { force: true, recursive: true });
    }

    expect(calls).toContainEqual({
      command: "/usr/bin/sudo",
      args: ["/usr/bin/apt", "install", "-y", "vim"],
    });
    expect(calls.some(({ args }) => args.includes("curl"))).toBe(false);
  });

  test("Linux prune removes only previously owned, unshared packages", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-linux-prune-"));
    const repo = await createLinuxRepo(stateRoot, {
      workstation: { apt: "manual\n" },
      server: { apt: "shared\n" },
    });
    const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
    try {
      await writeFile(
        join(stateRoot, "linux-package-ownership.json"),
        `${JSON.stringify({
          version: 1,
          profiles: { workstation: { apt: ["shared", "stale-only"] }, server: { apt: ["shared"] } },
        })}\n`,
      );
      await Effect.runPromise(
        applyLinux({
          config: {
            configPath: join(stateRoot, "config.toml"),
            stateRoot,
            source: { kind: "local", path: repo },
            declarations: {
              schema: 1,
              profiles: {
                workstation: { linux: { apt: { manifest: "packages/workstation/apt.txt" } } },
                server: { linux: { apt: { manifest: "packages/server/apt.txt" } } },
              },
            },
            machineId: "test:x86_64-linux",
            machineIdOverridden: true,
          },
          profile: "workstation",
          packageManager: "apt",
          prune: true,
          noRefresh: true,
          yes: true,
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
                stdout:
                  "manual\tinstall ok installed\nshared\tinstall ok installed\nstale-only\tinstall ok installed\n",
                stderr: "",
              };
            }
            if (args[0] === "-s") {
              return { code: 0, stdout: "Remv stale-only [1.0]\n", stderr: "" };
            }
            return { code: 0, stdout: "", stderr: "" };
          },
        }),
      );
    } finally {
      await rm(stateRoot, { force: true, recursive: true });
      await rm(repo, { force: true, recursive: true });
    }

    expect(calls).toContainEqual({
      command: "/usr/bin/sudo",
      args: ["/usr/bin/apt", "remove", "-y", "stale-only"],
    });
    expect(calls.some(({ args }) => args.includes("manual") || args.includes("shared"))).toBe(
      false,
    );
  });
});
