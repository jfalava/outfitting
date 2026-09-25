import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { ManagerConfig } from "@/config";
import { loadConfig } from "@/config";
import { CliFailure } from "@/errors";
import { updateAll } from "@/update/all";
import { updateBrew } from "@/update/brew";
import { updateLinux } from "@/update/linux";
import { updateLinuxAll } from "@/update/linux-all";
import { updateNix } from "@/update/nix";

vi.mock("@/update/brew", () => ({
  updateBrew: vi.fn(() => Effect.void),
}));
vi.mock("@/update/linux", () => ({
  isLinuxProfile: (value: string) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value),
  updateLinux: vi.fn(() => Effect.void),
}));
vi.mock("@/update/nix", () => ({
  updateNix: vi.fn(() => Effect.void),
}));

const config: ManagerConfig = {
  configPath: "/state/config.toml",
  stateRoot: "/state",
  machineId: "test:aarch64-darwin",
  machineIdOverridden: true,
};

beforeEach(() => vi.clearAllMocks());

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function makeLinuxConfig(
  profile: string,
  declaration: { apt: string; nix?: { flake: string; attribute: string } },
): Promise<{ config: ManagerConfig; repo: string }> {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-update-all-state-"));
  const repo = await mkdtemp(join(tmpdir(), "outfitting-update-all-repo-"));
  temporaryRoots.push(stateRoot, repo);
  await mkdir(join(repo, "packages"), { recursive: true });
  await writeFile(join(repo, "packages", "apt.txt"), declaration.apt);
  const linux: Record<string, unknown> = { apt: { manifest: "packages/apt.txt" } };
  if (declaration.nix !== undefined) {
    await mkdir(join(repo, declaration.nix.flake), { recursive: true });
    await writeFile(join(repo, declaration.nix.flake, "flake.nix"), "{ outputs = {}; }\n");
    linux.nix = declaration.nix;
  }
  const toml = [
    "schema = 1",
    "[source]",
    `path = ${JSON.stringify(repo)}`,
    "[linux]",
    `profile = ${JSON.stringify(profile)}`,
    `[profiles.${JSON.stringify(profile)}.linux.apt]`,
    'manifest = "packages/apt.txt"',
  ];
  if (declaration.nix !== undefined) {
    toml.push(
      `[profiles.${JSON.stringify(profile)}.linux.nix]`,
      `flake = ${JSON.stringify(declaration.nix.flake)}`,
      `attribute = ${JSON.stringify(declaration.nix.attribute)}`,
    );
  }
  await writeFile(join(stateRoot, "config.toml"), `${toml.join("\n")}\n`);
  return {
    repo,
    config: await loadConfig({ stateRoot, machineId: "test:aarch64-linux" }),
  };
}

test("update all forwards --no-push to Nix and Homebrew", async () => {
  await Effect.runPromise(updateAll({ config, noPush: true }));

  expect(updateNix).toHaveBeenCalledWith({
    action: "switch",
    config,
    noPush: true,
    noRefresh: false,
  });
  expect(updateBrew).toHaveBeenCalledWith({ config, noPush: true });
});

test("Linux update all applies the selected BYOR Nix component before native packages", async () => {
  const { config: linuxConfig, repo } = await makeLinuxConfig("hm-work", {
    apt: "curl\n",
    nix: { flake: "system/home", attribute: "homeConfigurations.work.activationPackage" },
  });

  await Effect.runPromise(
    updateLinuxAll({
      config: linuxConfig,
      packageManager: "pacman",
      noPush: true,
      noRefresh: true,
    }),
  );

  expect(updateNix).toHaveBeenCalledWith({
    action: "switch",
    config: linuxConfig,
    repo: expect.objectContaining({ root: repo }),
    profile: "hm-work",
    noPush: true,
  });
  expect(updateLinux).toHaveBeenCalledWith({
    config: linuxConfig,
    packageManager: "pacman",
    offline: false,
    run: undefined,
    which: undefined,
    osReleasePath: undefined,
    readOsRelease: undefined,
  });
  expect((updateNix as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan(
    (updateLinux as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!,
  );
});

test("Linux native-only BYOR profile skips Nix", async () => {
  const { config: linuxConfig } = await makeLinuxConfig("apt-work", { apt: "curl\n" });
  await Effect.runPromise(
    updateLinuxAll({
      config: linuxConfig,
      packageManager: "apt",
    }),
  );

  expect(updateNix).not.toHaveBeenCalled();
  expect(updateLinux).toHaveBeenCalledWith(
    expect.objectContaining({ packageManager: "apt", offline: false }),
  );
});

test("Linux update all continues with native packages after Home Manager fails", async () => {
  // Bun's vi.mocked can lose the mock brand after clearAllMocks; call the mock API directly.
  (updateNix as ReturnType<typeof vi.fn>).mockReturnValueOnce(
    Effect.fail(new CliFailure({ message: "source unavailable" })),
  );

  const { config: linuxConfig } = await makeLinuxConfig("hm-fails", {
    apt: "curl\n",
    nix: { flake: "system/home", attribute: "homeConfigurations.work.activationPackage" },
  });

  await expect(
    Effect.runPromise(
      updateLinuxAll({
        config: linuxConfig,
        packageManager: "apt",
      }),
    ),
  ).rejects.toThrow("nix switch");

  expect(updateLinux).toHaveBeenCalledWith(
    expect.objectContaining({ packageManager: "apt", offline: false }),
  );
});
