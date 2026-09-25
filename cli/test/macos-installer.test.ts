import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const installerPath = fileURLToPath(new URL("../../macos-install-script.sh", import.meta.url));
const postInstallPath = fileURLToPath(
  new URL("../../macos-post-install-script.sh", import.meta.url),
);

describe("macOS installer delegation", () => {
  test("downloads the manager and delegates managed operations", async () => {
    const script = await readFile(installerPath, "utf8");

    expect(script).toContain("outfitting-manager-darwin-arm64.zip");
    expect(script).toContain("$release_base/$asset.sha256");
    expect(script).toContain("run_outfitting_manager init");
    expect(script).toContain("run_outfitting_manager setup");
    expect(script).not.toContain(["/usr/local", "bin/brew"].join("/"));
    expect(script).not.toContain("x86_64");

    expect(script).not.toContain("git clone");
    expect(script).not.toContain("brew bundle");
    expect(script).not.toContain("nix build");
    expect(script).not.toContain("nix-env");
    expect(script).not.toContain("darwin-rebuild");
  });

  test("reuses an existing Nix installation instead of reinstalling it", async () => {
    const script = await readFile(installerPath, "utf8");

    expect(script).toContain("/nix/var/nix/profiles/default/bin/nix");
    expect(script).toContain("$HOME/.nix-profile/bin/nix");
    expect(script).toContain("if nix_available; then");
    expect(script).toContain("A Nix installation already exists");
  });

  test("post-install reads the font list from the configured sparse source", async () => {
    const script = await readFile(postInstallPath, "utf8");

    expect(script).toContain('FONTGET_LIST="$REPO_PATH/fonts/fontget.txt"');
    expect(script).not.toContain('REPO_PATH="$HOME/.config/outfitting/repo"');
  });

  test("bootstraps prerequisites before manager setup and updates", async () => {
    const script = await readFile(installerPath, "utf8");
    const manager = script.indexOf("install_outfitting_manager || exit 1");
    const brew = script.indexOf("install_homebrew || exit 1");
    const nix = script.indexOf("install_nix || exit 1");
    const init = script.indexOf("run_outfitting_manager init || exit 1");
    const setup = script.indexOf("run_outfitting_manager setup || exit 1");

    expect(manager).toBeGreaterThanOrEqual(0);
    expect(brew).toBeGreaterThan(manager);
    expect(nix).toBeGreaterThan(brew);
    expect(init).toBeGreaterThan(nix);
    expect(setup).toBeGreaterThan(init);
  });
});
