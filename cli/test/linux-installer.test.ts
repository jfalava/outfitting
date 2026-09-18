import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const installerPath = fileURLToPath(new URL("../../linux-install-script.sh", import.meta.url));

describe("Linux installer delegation", () => {
  test("initializes before applying the selected profile", async () => {
    const script = await readFile(installerPath, "utf8");

    expect(script).toContain('PROFILE_ARGS=(--profile "$PROFILE")');
    expect(script).toContain('outfitting-manager init "${PROFILE_ARGS[@]}"');
    expect(script).toContain('outfitting-manager setup "${PROFILE_ARGS[@]}" --no-fetch');
    expect(script).toContain('"$PROFILE" == "ubuntu-wsl"');
    expect(script).not.toContain("outfitting-manager update all");
    expect(script.indexOf("outfitting-manager setup")).toBeGreaterThan(
      script.indexOf("outfitting-manager init"),
    );
  });
});
