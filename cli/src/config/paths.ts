import { homedir } from "node:os";
import { join } from "node:path";

import { envValue } from "@/secrets";

/** Default XDG-style state root; matches existing `~/.config/outfitting/repo-path`. */
export const DEFAULT_STATE_ROOT_SEGMENTS = [".config", "outfitting"] as const;

export function defaultStateRoot(home = homedir()): string {
  return join(home, ...DEFAULT_STATE_ROOT_SEGMENTS);
}

/** Resolved state root: `OUTFITTING_STATE_ROOT` or `~/.config/outfitting`. */
export function stateRoot(home = homedir()): string {
  return envValue("OUTFITTING_STATE_ROOT") ?? defaultStateRoot(home);
}

export function configFilePath(root = stateRoot()): string {
  return join(root, "config.json");
}

/** Legacy shell path file written by `set_outfitting_repo`. */
export function repoPathFile(root = stateRoot()): string {
  return join(root, "repo-path");
}

export function manifestCacheDir(root = stateRoot()): string {
  return join(root, "cache", "manifests");
}

export function manifestsDir(root = stateRoot()): string {
  return join(root, "manifests");
}
