import { Effect } from "effect";
import { expect, test, vi } from "vitest";

import { CliFailure } from "@/errors";
import { activateNixSystem } from "@/update/nix/activate";
import { buildNixSystem } from "@/update/nix/build";
import { updateNix } from "@/update/nix/run";

vi.mock("@/process", () => ({ which: async () => "/bin/nix" }));
vi.mock("@/update/nix/recovery", () => ({ readNixRecovery: async () => undefined }));
vi.mock("@/update/nix/symlinks", () => ({ ensureNixSymlinks: async () => undefined }));
vi.mock("@/update/nix/build", () => ({ buildNixSystem: vi.fn() }));
vi.mock("@/update/nix/activate", () => ({ activateNixSystem: vi.fn() }));
vi.mock("@/lockfiles", () => ({
  pullLockfile: () => Effect.fail(new CliFailure({ message: "service unavailable" })),
}));

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
