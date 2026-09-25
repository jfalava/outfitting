import { homedir } from "node:os";
import { join } from "node:path";

import { envValue } from "@/secrets";

/** Unix state root; Windows defaults to Local AppData. */
export const DEFAULT_STATE_ROOT_SEGMENTS = [".config", "outfitting"] as const;

export function defaultStateRoot(
  home = homedir(),
  platform = process.platform,
  localAppData = process.env.LOCALAPPDATA,
): string {
  if (platform === "win32") {
    return join(localAppData || join(home, "AppData", "Local"), "outfitting");
  }
  return join(home, ...DEFAULT_STATE_ROOT_SEGMENTS);
}

/** Resolved state root: explicit override or the platform default. */
export function stateRoot(home = homedir()): string {
  return envValue("OUTFITTING_STATE_ROOT") ?? defaultStateRoot(home);
}

export function configFilePath(root = stateRoot()): string {
  return join(root, "config.toml");
}

/** Sparse Nix/package/Zsh source tree managed by outfitting-manager. */
export function sparseSourceRoot(root = stateRoot()): string {
  return join(root, "source");
}
