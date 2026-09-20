import { Effect } from "effect";
import { beforeEach, expect, test, vi } from "vitest";

import type { ManagerConfig } from "@/config";
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
  isLinuxProfile: (value: string) =>
    value === "generic-linux" || value === "oci-agents" || value === "ubuntu-wsl",
  updateLinux: vi.fn(() => Effect.void),
}));
vi.mock("@/update/nix", () => ({
  updateNix: vi.fn(() => Effect.void),
}));

const config: ManagerConfig = {
  stateRoot: "/state",
  machineId: "test:aarch64-darwin",
  machineIdOverridden: true,
  manifest: { baseUrl: "https://example.test/outfitting", ref: "main" },
};

beforeEach(() => vi.clearAllMocks());

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

test("Linux update all refreshes Home Manager before native packages", async () => {
  const linuxConfig = {
    ...config,
    machineId: "test:aarch64-linux",
    linux: { profile: "oci-agents" },
  };

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
    noPush: true,
    noRefresh: true,
    sourceFetcher: undefined,
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
});

test("Linux generic update all stays native-only", async () => {
  await Effect.runPromise(
    updateLinuxAll({
      config: { ...config, machineId: "test:aarch64-linux" },
      packageManager: "apt",
    }),
  );

  expect(updateNix).not.toHaveBeenCalled();
  expect(updateLinux).toHaveBeenCalledWith(
    expect.objectContaining({ packageManager: "apt", offline: false }),
  );
});

test("Linux update all continues with native packages after Home Manager fails", async () => {
  vi.mocked(updateNix).mockReturnValueOnce(
    Effect.fail(new CliFailure({ message: "source unavailable" })),
  );

  await expect(
    Effect.runPromise(
      updateLinuxAll({
        config: { ...config, machineId: "test:aarch64-linux", linux: { profile: "ubuntu-wsl" } },
        packageManager: "apt",
      }),
    ),
  ).rejects.toThrow("nix switch");

  expect(updateLinux).toHaveBeenCalledWith(
    expect.objectContaining({ packageManager: "apt", offline: false }),
  );
});
