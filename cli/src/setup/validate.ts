import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { OutfittingRepo } from "@/config/repo";
import { MACOS_SOURCE_PATHS } from "@/setup/manifests";

/**
 * Validate the macOS repository contract before any machine state is changed.
 *
 * The manager intentionally supports repositories other than Outfitting, but
 * they must expose this small, platform-specific source closure.
 */
export async function validateMacosSource(
  repo: OutfittingRepo,
  paths: ReadonlyArray<string> = MACOS_SOURCE_PATHS,
): Promise<void> {
  for (const path of paths) {
    try {
      if (!(await stat(join(repo.root, path))).isFile()) {
        throw new Error("not a file");
      }
    } catch {
      throw new Error(`macOS repository is missing the required path: ${path}.`);
    }
  }

  const flake = await readFile(join(repo.root, "system/macos/flake.nix"), "utf8");
  if (!/\bdarwinConfigurations\s*=/.test(flake)) {
    throw new Error(
      "macOS repository has an invalid system/macos/flake.nix: darwinConfigurations is required.",
    );
  }
}
