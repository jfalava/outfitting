import { access, chmod, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

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

export async function readRepoPathFile(config: ManagerConfig): Promise<string | undefined> {
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

/** Validate a monorepo root and return structured paths. */
export async function validateOutfittingRepo(candidate: string): Promise<OutfittingRepo> {
  let absolute: string;
  try {
    absolute = isAbsolute(candidate) ? candidate : resolve(candidate);
    absolute = await realpath(absolute);
  } catch {
    throw new Error(`Outfitting repository path does not exist: ${candidate}`);
  }

  const flakePath = join(absolute, FLAKE_RELATIVE);
  const darwinNixPath = join(flakePath, "darwin.nix");

  if (!(await pathExists(join(flakePath, "flake.nix")))) {
    throw new Error(
      `Outfitting repo at ${absolute} is missing system/macos/flake.nix. Check OUTFITTING_REPO / repo-path.`,
    );
  }

  return {
    root: absolute,
    flakePath,
    darwinNixPath,
  };
}

/**
 * Persist monorepo path to the legacy `repo-path` file (mode 600).
 * Matches `set_outfitting_repo` so shell and manager share one source of truth.
 */
export async function writeRepoPath(
  repoRoot: string,
  options?: { stateRoot?: string },
): Promise<{ repo: OutfittingRepo; pathFile: string }> {
  const repo = await validateOutfittingRepo(repoRoot);
  const config = await loadConfig(
    options?.stateRoot === undefined ? undefined : { stateRoot: options.stateRoot },
  );
  const pathFile = repoPathFile(config.stateRoot);
  await mkdir(dirname(pathFile), { recursive: true });
  await writeFile(pathFile, `${repo.root}\n`, { mode: 0o600, encoding: "utf8" });
  await chmod(pathFile, 0o600);
  return { repo, pathFile };
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
  const fromFile = fromEnv === undefined ? await readRepoPathFile(config) : undefined;
  const candidate = fromEnv ?? fromFile;

  if (candidate === undefined) {
    throw new Error(
      "Outfitting repository location is not configured. Set OUTFITTING_REPO or run: outfitting-manager setup --repo /path/to/outfitting",
    );
  }

  return validateOutfittingRepo(candidate);
}

/** Soft resolve: returns undefined when unset / invalid (setup reporting). */
export async function tryResolveOutfittingRepo(options?: {
  config?: ManagerConfig;
  envRepo?: string;
}): Promise<OutfittingRepo | undefined> {
  try {
    return await resolveOutfittingRepo(options);
  } catch {
    return undefined;
  }
}

/** Physical path for temp dirs (Nix rejects lock paths under macOS /tmp symlinks). */
export async function physicalPath(path: string): Promise<string> {
  return realpath(path);
}
