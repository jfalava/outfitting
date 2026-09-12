import { access, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { loadConfig } from "@/config/load";
import { repoPathFile } from "@/config/paths";
import type { ManagerConfig } from "@/config/types";
import { envValue } from "@/secrets";

const FLAKE_RELATIVE = join("system", "macos");

export interface OutfittingRepo {
  /** Absolute path to the monorepo root. */
  root: string;
  /** Absolute path to `system/macos` (flake root for darwinConfigurations.macos). */
  flakePath: string;
  /** Absolute path to `system/macos/darwin.nix`. */
  darwinNixPath: string;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readLegacyRepoPath(config: ManagerConfig): Promise<string | undefined> {
  const path = repoPathFile(config.stateRoot);
  try {
    const raw = (await readFile(path, "utf8")).trim();
    return raw.length > 0 ? raw : undefined;
  } catch (cause) {
    if (
      cause instanceof Error &&
      "code" in cause &&
      (cause as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return undefined;
    }
    throw cause;
  }
}

/**
 * Resolve monorepo root.
 * Precedence: `OUTFITTING_REPO` → legacy `repo-path` file → fail.
 */
export async function resolveOutfittingRepo(options?: {
  config?: ManagerConfig;
  envRepo?: string;
}): Promise<OutfittingRepo> {
  const config = options?.config ?? (await loadConfig());
  const fromEnv = options?.envRepo ?? envValue("OUTFITTING_REPO");
  const fromFile = fromEnv === undefined ? await readLegacyRepoPath(config) : undefined;
  const candidate = fromEnv ?? fromFile;

  if (candidate === undefined) {
    throw new Error(
      "Outfitting repository location is not configured. Set OUTFITTING_REPO or run setup after writing ~/.config/outfitting/repo-path (legacy set_outfitting_repo).",
    );
  }

  const root = isAbsolute(candidate) ? candidate : resolve(candidate);
  const flakePath = join(root, FLAKE_RELATIVE);
  const darwinNixPath = join(flakePath, "darwin.nix");

  if (!(await pathExists(join(flakePath, "flake.nix")))) {
    throw new Error(
      `Outfitting repo at ${root} is missing system/macos/flake.nix. Check OUTFITTING_REPO / repo-path.`,
    );
  }

  return {
    root,
    flakePath,
    darwinNixPath,
  };
}

/** Physical path for temp dirs (Nix rejects lock paths under macOS /tmp symlinks). */
export async function physicalPath(path: string): Promise<string> {
  return realpath(path);
}
