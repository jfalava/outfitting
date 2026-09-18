import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { loadConfig, sparseSourceRoot } from "@/config";
import { CliFailure } from "@/errors";
import { runSetup } from "@/setup/run";
import { activateNixSystem } from "@/update/nix/activate";
import { buildNixSystem } from "@/update/nix/build";
import { updateNix } from "@/update/nix/run";
import { ensureNixSymlinks } from "@/update/nix/symlinks";

vi.mock("@/process", () => ({ which: async () => "/bin/nix" }));
vi.mock("@/update/nix/recovery", () => ({ readNixRecovery: async () => undefined }));
vi.mock("@/update/nix/symlinks", () => ({ ensureNixSymlinks: vi.fn(async () => undefined) }));
vi.mock("@/update/nix/build", () => ({ buildNixSystem: vi.fn() }));
vi.mock("@/update/nix/activate", () => ({ activateNixSystem: vi.fn() }));
vi.mock("@/lockfiles", () => ({
  pullLockfile: () => Effect.fail(new CliFailure({ message: "service unavailable" })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OUTFITTING_REPO", "");
});
afterEach(() => vi.unstubAllEnvs());

test.each([false, true])(
  "setup source survives update (managed sparse source: %s)",
  async (managed) => {
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
      await expect(
        Effect.runPromise(
          updateNix({
            action: "build",
            config,
            sourceFetcher: fetcher,
          }),
        ),
      ).rejects.toThrow("required remote Nix lock");
      const expectedRoot = await realpath(managed ? sparseSourceRoot(stateRoot) : checkout);
      expect(await readFile(join(stateRoot, "repo-path"), "utf8")).toBe(`${expectedRoot}\n`);
      expect(ensureNixSymlinks).toHaveBeenCalledWith(
        expect.objectContaining({ root: expectedRoot }),
      );
      expect(await readFile(join(expectedRoot, "system", "macos", "flake.nix"), "utf8")).toBe(
        managed ? "refreshed sparse source" : "local checkout",
      );
      if (managed) expect(fetcher).toHaveBeenCalled();
      else expect(fetcher).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("switch never builds or activates when the canonical lock cannot be pulled", async () => {
  await expect(
    Effect.runPromise(
      updateNix({
        action: "switch",
        config: {
          stateRoot: "/unused",
          machineId: "test:aarch64-darwin",
          machineIdOverridden: true,
          manifest: { baseUrl: "https://example.test/outfitting", ref: "main" },
        },
        repo: {
          root: "/repo",
          flakePath: "/repo/system/macos",
          darwinNixPath: "/repo/system/macos/darwin.nix",
        },
      }),
    ),
  ).rejects.toThrow("required remote Nix lock");
  expect(buildNixSystem).not.toHaveBeenCalled();
  expect(activateNixSystem).not.toHaveBeenCalled();
});
