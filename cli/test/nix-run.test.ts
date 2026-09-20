import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { loadConfig, sparseSourceRoot } from "@/config";
import { CliFailure } from "@/errors";
import { pushLockfile } from "@/lockfiles";
import { runSetup } from "@/setup/run";
import { activateNixSystem } from "@/update/nix/activate";
import { buildNixSystem } from "@/update/nix/build";
import { updateNix } from "@/update/nix/run";
import { ensureNixSymlinks } from "@/update/nix/symlinks";

vi.mock("@/process", () => ({ which: async () => "/bin/nix" }));
vi.mock("@/update/nix/recovery", () => ({ readNixRecovery: async () => undefined }));
vi.mock("@/update/nix/symlinks", () => ({ ensureNixSymlinks: vi.fn(async () => undefined) }));
vi.mock("@/update/nix/build", () => ({
  buildNixSystem: vi.fn(async () => "/nix/store/test-system"),
}));
vi.mock("@/update/nix/activate", () => ({ activateNixSystem: vi.fn(async () => undefined) }));
vi.mock("@/lockfiles", () => ({
  pullLockfile: () => Effect.fail(new CliFailure({ message: "service unavailable" })),
  pushLockfile: vi.fn(() => Effect.void),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildNixSystem).mockImplementation(async () => "/nix/store/test-system");
  vi.mocked(activateNixSystem).mockImplementation(async () => undefined);
  vi.stubEnv("OUTFITTING_REPO", "");
});
afterEach(() => vi.unstubAllEnvs());

test.each([false, true])(
  "setup source survives update (managed sparse source: %s)",
  async (managed) => {
    // Sparse macOS source refresh is darwin-only; Linux update nix uses HM profiles.
    if (managed && process.platform !== "darwin") {
      return;
    }
    const root = await mkdtemp(join(tmpdir(), "outfitting-nix-source-"));
    try {
      const stateRoot = join(root, "state");
      const checkout = join(root, "checkout");
      await mkdir(join(checkout, "system", "macos"), { recursive: true });
      await writeFile(join(checkout, "system", "macos", "flake.nix"), "local checkout");
      await writeFile(join(checkout, "system", "macos", "darwin.nix"), "local darwin");
      await Effect.runPromise(
        runSetup({
          stateRoot,
          repo: managed ? undefined : checkout,
          sourcePaths: managed ? ["system/macos/flake.nix"] : undefined,
          fetchManifests: managed,
          skipSymlinks: true,
          fetcher: async () => new Response("old sparse source"),
        }),
      );
      const config = await loadConfig({ stateRoot });
      const fetcher = vi.fn(async () => new Response("refreshed sparse source"));
      // Force macOS flake resolution even on Linux hosts running this suite.
      const macosRepo = {
        root: await realpath(checkout),
        flakePath: join(await realpath(checkout), "system", "macos"),
        darwinNixPath: join(await realpath(checkout), "system", "macos", "darwin.nix"),
        flakeKind: "macos" as const,
        systemAttr: "darwinConfigurations.macos.system",
      };
      await Effect.runPromise(
        updateNix({
          action: "build",
          config,
          noPush: true,
          repo: managed ? undefined : macosRepo,
          sourceFetcher: fetcher,
        }),
      );
      if (managed) {
        const expectedRoot = await realpath(sparseSourceRoot(stateRoot));
        expect(await readFile(join(stateRoot, "repo-path"), "utf8")).toBe(`${expectedRoot}\n`);
        expect(ensureNixSymlinks).toHaveBeenCalledWith(
          expect.objectContaining({ root: expectedRoot }),
        );
        expect(await readFile(join(expectedRoot, "system", "macos", "flake.nix"), "utf8")).toBe(
          "refreshed sparse source",
        );
        expect(fetcher).toHaveBeenCalled();
      } else {
        expect(ensureNixSymlinks).toHaveBeenCalledWith(
          expect.objectContaining({ root: macosRepo.root, flakeKind: "macos" }),
        );
        expect(fetcher).not.toHaveBeenCalled();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("switch bootstraps without a canonical lock when upload is disabled", async () => {
  await Effect.runPromise(
    updateNix({
      action: "switch",
      config: {
        stateRoot: "/unused",
        machineId: "test:aarch64-darwin",
        machineIdOverridden: true,
        manifest: { baseUrl: "https://example.test/outfitting", ref: "main" },
      },
      noPush: true,
      repo: {
        root: "/repo",
        flakePath: "/repo/system/macos",
        darwinNixPath: "/repo/system/macos/darwin.nix",
        flakeKind: "macos",
        systemAttr: "darwinConfigurations.macos.system",
      },
    }),
  );
  expect(buildNixSystem).toHaveBeenCalled();
  expect(activateNixSystem).toHaveBeenCalled();
  expect(pushLockfile).not.toHaveBeenCalled();
});

test("publishes a lock generated during a macOS bootstrap", async () => {
  const root = await mkdtemp(join(tmpdir(), "outfitting-nix-push-"));
  try {
    const flakePath = join(root, "system", "macos");
    await mkdir(flakePath, { recursive: true });
    const lockPath = join(flakePath, "flake.lock");
    await writeFile(join(flakePath, "flake.nix"), "flake");
    vi.mocked(buildNixSystem).mockImplementation(async ({ repo }) => {
      await writeFile(join(repo.flakePath, "flake.lock"), '{ "version": 7 }\n');
      return "/nix/store/system";
    });

    const config = {
      stateRoot: join(root, "state"),
      machineId: "test:aarch64-darwin",
      machineIdOverridden: true,
      manifest: { baseUrl: "https://example.test/outfitting", ref: "main" },
    };
    await Effect.runPromise(
      updateNix({
        action: "build",
        config,
        repo: {
          root,
          flakePath,
          darwinNixPath: join(flakePath, "darwin.nix"),
          flakeKind: "macos",
          systemAttr: "darwinConfigurations.macos.system",
        },
      }),
    );

    expect(pushLockfile).toHaveBeenCalledWith({
      machine: config.machineId,
      kind: "nix",
      path: lockPath,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publishes the local Home Manager lock after a Linux action", async () => {
  const root = await mkdtemp(join(tmpdir(), "outfitting-hm-push-"));
  try {
    const flakePath = join(root, "system", "oci-agents");
    await mkdir(flakePath, { recursive: true });
    const lockPath = join(flakePath, "flake.lock");
    await writeFile(lockPath, '{ "version": 7 }\n');

    const config = {
      stateRoot: join(root, "state"),
      machineId: "test:aarch64-linux",
      machineIdOverridden: true,
      manifest: { baseUrl: "https://example.test/outfitting", ref: "main" },
    };
    await Effect.runPromise(
      updateNix({
        action: "build",
        config,
        repo: {
          root,
          flakePath,
          darwinNixPath: "",
          flakeKind: "home-manager",
          systemAttr: "homeConfigurations.oci-agents.activationPackage",
          homeManagerName: "oci-agents",
        },
      }),
    );

    expect(pushLockfile).toHaveBeenCalledWith({
      machine: config.machineId,
      kind: "nix",
      path: lockPath,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
