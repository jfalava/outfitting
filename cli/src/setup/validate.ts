import type { OutfittingRepo } from "@/config/repo";
import { validateMacosByorSource } from "@/source/contract";

/**
 * Validate the macOS repository contract before any machine state is changed.
 *
 * Local and remote sources use the same repository-owned `outfitting.json` contract.
 */
export async function validateMacosSource(
  repo: OutfittingRepo,
  options?: { profile?: string },
): Promise<void> {
  await validateMacosByorSource({ root: repo.root, profile: options?.profile });
}
