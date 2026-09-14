import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const installerPath = fileURLToPath(new URL("../../macos-install-script.sh", import.meta.url));

describe("macOS installer delegation", () => {
  test("downloads the manager and delegates managed operations", async () => {
    const script = await readFile(installerPath, "utf8");

    expect(script).toContain("outfitting-manager-darwin-arm64.zip");
    expect(script).toContain("$release_base/$asset.sha256");
    expect(script).toContain("run_outfitting_manager setup");
    expect(script).toContain("run_outfitting_manager update brew --no-sync");
    expect(script).toContain("run_outfitting_manager update nix");

    expect(script).not.toContain("git clone");
    expect(script).not.toContain("brew bundle");
    expect(script).not.toContain("nix build");
    expect(script).not.toContain("nix-env");
    expect(script).not.toContain("darwin-rebuild");
  });

  test("bootstraps prerequisites before manager setup and updates", async () => {
    const script = await readFile(installerPath, "utf8");
    const manager = script.indexOf("install_outfitting_manager || exit 1");
    const brew = script.indexOf("install_homebrew || exit 1");
    const nix = script.indexOf("install_nix || exit 1");
    const setup = script.indexOf("run_outfitting_manager setup || exit 1");
    const brewUpdate = script.indexOf("run_outfitting_manager update brew --no-sync || exit 1");
    const nixUpdate = script.indexOf("run_outfitting_manager update nix || exit 1");

    expect(manager).toBeGreaterThanOrEqual(0);
    expect(brew).toBeGreaterThan(manager);
    expect(nix).toBeGreaterThan(brew);
    expect(setup).toBeGreaterThan(nix);
    expect(brewUpdate).toBeGreaterThan(setup);
    expect(nixUpdate).toBeGreaterThan(brewUpdate);
  });
});
