import { describe, expect, test } from "vitest";

import { NIX_ACTIONS } from "@/platform";
import { MACOS_SOURCE_PATHS } from "@/setup/manifests";
import { HOMEBREW_INVENTORY_HEADER } from "@/update/snapshot";

/**
 * Step 7 dual-run gates (real machine). This test only locks the golden signals
 * agents should compare — not a substitute for live zsh vs manager runs.
 */
describe("dual-run golden signals (checklist)", () => {
  test("homebrew inventory header is stable", () => {
    expect(HOMEBREW_INVENTORY_HEADER).toBe("outfitting-homebrew-inventory-v1");
  });

  test("nix actions match shell outfit-rebuild subset", () => {
    expect([...NIX_ACTIONS]).toEqual(["build", "switch", "test", "dry"]);
  });

  test("setup fetches the macOS sparse source closure", () => {
    expect([...MACOS_SOURCE_PATHS]).toEqual([
      "system/macos/flake.nix",
      "system/macos/darwin.nix",
      "system/macos/home.nix",
      "system/macos/zsh/macos.plugin.zsh",
      "system/common/zsh.nix",
      "system/common/zsh/outfitting.plugin.zsh",
      "packages/common/programs.nix",
      "packages/common/packages.nix",
      "packages/macos/programs.nix",
      "packages/macos/packages.nix",
      "packages/macos/zed.nix",
      "packages/macos/Brewfile",
      "fonts/fontget.txt",
    ]);
  });

  test("documents comparison method for operators", () => {
    const checklist = [
      "exit codes for update brew|bun|nix dry|all",
      "homebrew-inventory blob bytes (header + sorted sections)",
      "nix dry store path presence (not full activate in CI)",
      "repo-path file content after setup --repo",
    ];
    expect(checklist.length).toBeGreaterThanOrEqual(4);
  });
});
