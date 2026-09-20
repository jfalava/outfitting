import { Effect } from "effect";
import { beforeEach, expect, test, vi } from "vitest";

import type { ManagerConfig } from "@/config";
import { updateAll } from "@/update/all";
import { updateBrew } from "@/update/brew";
import { updateNix } from "@/update/nix";

vi.mock("@/update/brew", () => ({
  updateBrew: vi.fn(() => Effect.void),
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

  expect(updateNix).toHaveBeenCalledWith({ action: "switch", config, noPush: true });
  expect(updateBrew).toHaveBeenCalledWith({ config, noPush: true });
});
