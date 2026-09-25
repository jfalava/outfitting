import { realpath } from "node:fs/promises";

import { beforeEach, describe, expect, test, vi } from "vitest";

import { resolveOutfittingRepo } from "@/config";
import { collectDiff } from "@/diff/compare";
import type { runCommand } from "@/process";
import { parseByorContract } from "@/source/contract";
import { closeNixLock, openNixLock } from "@/update/nix/lock";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  realpath: vi.fn(),
}));

vi.mock("@/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config")>()),
  resolveOutfittingRepo: vi.fn(),
}));

vi.mock("@/update/nix/lock", () => ({
  openNixLock: vi.fn(),
  closeNixLock: vi.fn(),
}));

const config = {
  configPath: "/state/config.toml",
  stateRoot: "/state",
  machineId: "test:arm64-darwin",
  machineIdOverridden: true,
  source: { kind: "local" as const, path: "/repo" },
  macos: { profile: "macos" },
  declarations: parseByorContract({
    schema: 1,
    profiles: {
      macos: {
        macos: { nix: { flake: "system/macos", attribute: "darwinConfigurations.macos.system" } },
      },
    },
  }),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOutfittingRepo).mockResolvedValue({
    root: "/repo",
    contract: config.declarations,
    flakePath: "/repo/system/macos",
    darwinNixPath: "/repo/system/macos/darwin.nix",
    flakeKind: "macos",
    systemAttr: "darwinConfigurations.macos.system",
  });
  vi.mocked(openNixLock).mockResolvedValue({ lockDir: "/lock", lockPath: "/lock/flake.lock" });
  vi.mocked(realpath).mockResolvedValue("/nix/store/active-system");
});

describe("Nix active-system comparison", () => {
  test.each([
    { desired: "/nix/store/active-system", status: "same", changed: [] },
    {
      desired: "/nix/store/built-but-not-activated",
      status: "different",
      changed: ["system: /nix/store/active-system → /nix/store/built-but-not-activated"],
    },
  ])(
    "reports $status based on the active path, not store availability",
    async ({ desired, status, changed }) => {
      // No build plan is printed, even when the desired system differs.
      const run = vi
        .fn<typeof runCommand>()
        .mockResolvedValue({ code: 0, stdout: desired, stderr: "" });
      const result = await collectDiff({
        platform: "macos",
        manager: "nix",
        config,
        which: async () => "/bin/nix",
        run,
      });
      expect(result.sections[0]).toMatchObject({
        manager: "nix",
        status,
        changed,
        missing: [],
        extra: [],
      });
      expect(result.unavailable).toBe(false);
      expect(result.differences).toBe(status === "different");
      expect(realpath).toHaveBeenCalledExactlyOnceWith("/run/current-system");
      expect(run).toHaveBeenCalledExactlyOnceWith(
        "/bin/nix",
        [
          "eval",
          "--raw",
          "--impure",
          "--reference-lock-file",
          "/lock/flake.lock",
          "--no-write-lock-file",
          "path:/repo/system/macos#darwinConfigurations.macos.system.outPath",
        ],
        expect.objectContaining({
          inherit: false,
          env: expect.objectContaining({ OUTFITTING_REPO: "/repo" }),
        }),
      );
      expect(run.mock.calls[0]?.[2]?.env).not.toHaveProperty("NIX_PATH");
      expect(closeNixLock).toHaveBeenCalledExactlyOnceWith("/lock");
    },
  );

  test.each([
    { code: 1, stdout: "", stderr: "evaluation failed" },
    { code: 0, stdout: "", stderr: "" },
  ])("does not report same for failed or empty evaluation: $code", async (output) => {
    const result = await collectDiff({
      platform: "macos",
      manager: "nix",
      config,
      which: async () => "nix",
      run: async () => output,
    });
    expect(result.unavailable).toBe(true);
    expect(result.sections[0]?.status).toBe("unavailable");
    expect(closeNixLock).toHaveBeenCalledExactlyOnceWith("/lock");
  });

  test("reports a missing active system as unavailable and releases the lock", async () => {
    vi.mocked(realpath).mockRejectedValue(new Error("missing /run/current-system"));
    const run = vi.fn<typeof runCommand>();
    const result = await collectDiff({
      platform: "macos",
      manager: "nix",
      config,
      which: async () => "nix",
      run,
    });
    expect(result.sections[0]).toMatchObject({
      status: "unavailable",
      message: "missing /run/current-system",
    });
    expect(run).not.toHaveBeenCalled();
    expect(closeNixLock).toHaveBeenCalledExactlyOnceWith("/lock");
  });

  test("does not pull the lock or evaluate when offline", async () => {
    const run = vi.fn<typeof runCommand>();
    const result = await collectDiff({
      platform: "macos",
      manager: "nix",
      config,
      offline: true,
      run,
    });
    expect(result.unavailable).toBe(true);
    expect(openNixLock).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
