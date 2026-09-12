import { describe, expect, test } from "vitest";

import { buildNixSystem } from "@/update/nix/build";
import { NIX_SYSTEM_ATTR } from "@/update/nix/types";
import type { RunCommandResult } from "@/process";

const fakeRepo = {
  root: "/repo",
  flakePath: "/repo/system/macos",
  darwinNixPath: "/repo/system/macos/darwin.nix",
};

describe("buildNixSystem", () => {
  test("passes remote lock flags and returns store path", async () => {
    const run = async (
      command: string,
      args: ReadonlyArray<string>,
    ): Promise<RunCommandResult> => {
      expect(command).toBe("nix");
      expect(args).toContain("build");
      expect(args).toContain("--impure");
      expect(args).toContain("--reference-lock-file");
      expect(args).toContain("/tmp/flake.lock");
      expect(args).toContain("--no-write-lock-file");
      expect(args.at(-1)).toBe(`path:/repo/system/macos#${NIX_SYSTEM_ATTR}`);
      return { code: 0, stdout: "/nix/store/abc-darwin-system\n", stderr: "" };
    };

    const path = await buildNixSystem({
      repo: fakeRepo,
      lockPath: "/tmp/flake.lock",
      mode: "build",
      run,
    });
    expect(path).toBe("/nix/store/abc-darwin-system");
  });

  test("dry-run omits print-out-paths and uses --dry-run", async () => {
    const run = async (
      _command: string,
      args: ReadonlyArray<string>,
    ): Promise<RunCommandResult> => {
      expect(args).toContain("--dry-run");
      expect(args).not.toContain("--print-out-paths");
      expect(args).not.toContain("--reference-lock-file");
      return { code: 0, stdout: "", stderr: "" };
    };

    const path = await buildNixSystem({
      repo: fakeRepo,
      mode: "dry",
      run,
    });
    expect(path).toBe("");
  });

  test("fails when nix exits nonzero", async () => {
    const run = async (): Promise<RunCommandResult> => ({
      code: 1,
      stdout: "",
      stderr: "boom",
    });
    await expect(
      buildNixSystem({ repo: fakeRepo, mode: "build", run }),
    ).rejects.toThrow(/nix build failed/);
  });
});
