import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const installerPath = fileURLToPath(new URL("../../linux-install-script.sh", import.meta.url));

describe("Linux installer delegation", () => {
  test("initializes before applying the selected profile", async () => {
    const script = await readFile(installerPath, "utf8");

    expect(script).toContain('PROFILE_ARGS=(--profile "$PROFILE")');
    expect(script).toContain('outfitting-manager init "${PROFILE_ARGS[@]}"');
    expect(script).toContain(
      'outfitting-manager apply "${PROFILE_ARGS[@]}" --no-refresh --yes --if-configured',
    );
    expect(script).toContain(
      'outfitting-manager nix switch "${PROFILE_ARGS[@]}" --no-refresh --no-push --if-configured',
    );
    expect(script).toContain("bash -s -- --profile ubuntu-wsl");
    expect(script).not.toContain('PROFILE_ARGS+=(--repo "$OUTFITTING_REPO")');
    expect(script).not.toContain("outfitting-manager setup");
    expect(script).not.toContain("outfitting-manager update all");
    expect(script.indexOf("outfitting-manager apply")).toBeGreaterThan(
      script.indexOf("outfitting-manager init"),
    );
  });
});
