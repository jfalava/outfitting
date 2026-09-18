import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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
import {
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
    expect(missingLinuxPackages(["curl", "git", "git"], new Set(["curl", "vim"]))).toEqual([
      "git",
    ]);

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
