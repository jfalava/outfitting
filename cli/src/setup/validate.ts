import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { OutfittingRepo } from "@/config/repo";
import { MACOS_SOURCE_PATHS } from "@/setup/manifests";
import {
  byorContractPlatforms,
  tryReadByorContract,
  validateMacosByorSource,
} from "@/source/contract";

/**
 * Validate the macOS repository contract before any machine state is changed.
 *
 * BYOR checkouts use `outfitting.json` macOS profiles. Legacy repositories must
 * expose the fixed monorepo macOS source closure.
 */
export async function validateMacosSource(
  repo: OutfittingRepo,
  options?: { profile?: string; paths?: ReadonlyArray<string> },
): Promise<void> {
  const contract = await tryReadByorContract(repo.root);
  if (contract !== undefined && byorContractPlatforms(contract).macos) {
    await validateMacosByorSource({ root: repo.root, profile: options?.profile });
    return;
  }

  const paths = options?.paths ?? MACOS_SOURCE_PATHS;
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
