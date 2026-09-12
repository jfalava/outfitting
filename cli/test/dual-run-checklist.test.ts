import { describe, expect, test } from "vitest";

import { HOMEBREW_INVENTORY_HEADER } from "@/update/snapshot";
import { NIX_ACTIONS } from "@/platform";
import { SETUP_MANIFEST_PATHS } from "@/setup/manifests";

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

  test("setup prefetches brew + bun manifests", () => {
    expect([...SETUP_MANIFEST_PATHS]).toEqual([
      "packages/macos/Brewfile",
      "packages/bun.txt",
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
