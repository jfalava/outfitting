import { constants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { loadConfig } from "@/config/load";
import { repoPathFile } from "@/config/paths";
import type { ManagerConfig } from "@/config/types";
import { runCommand } from "@/process";
import { envValue } from "@/secrets";

const FLAKE_RELATIVE = join("system", "macos");
export const DEFAULT_OUTFITTING_REPO_URL = "https://github.com/jfalava/outfitting.git";

/** Paths that identify a valid Outfitting source (full checkout or sparse tree). */
const SOURCE_MARKERS = [
  join("system", "macos", "flake.nix"),
  join("system", "oci-agents", "flake.nix"),
  join("system", "ubuntu-wsl", "flake.nix"),
  join("packages", "linux", "generic-linux.txt"),
] as const;

export interface OutfittingRepo {
  /** Absolute path to the full repository or sparse source root. */
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

function isNotFound(cause: unknown): boolean {
  return (
    cause instanceof Error && "code" in cause && (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
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

/** Validate a repository or sparse source root and return structured paths. */
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
  const markers = SOURCE_MARKERS.map((relative) => join(absolute, relative));
  const present = await Promise.all(markers.map((path) => pathExists(path)));
  if (!present.some(Boolean)) {
    throw new Error(
      `Outfitting repo at ${absolute} is missing a recognized source marker (system/macos, system/oci-agents, system/ubuntu-wsl, or packages/linux/generic-linux.txt). Check OUTFITTING_REPO / repo-path.`,
    );
  }

  return {
    root: absolute,
    flakePath,
    darwinNixPath,
  };
}

/**
 * Persist a repository or sparse source path to the legacy `repo-path` file (mode 600).
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

/** Clone or fast-forward the repository used by Linux Nix-backed profiles. */
export async function syncOutfittingRepo(
  candidate: string,
  options: {
    ref: string;
    run?: typeof runCommand;
  },
): Promise<OutfittingRepo> {
  const root = isAbsolute(candidate) ? candidate : resolve(candidate);
  const run = options.run ?? runCommand;
  await mkdir(dirname(root), { recursive: true });

  let clone = false;
  try {
    const info = await stat(root);
    clone = info.isDirectory() && (await readdir(root)).length === 0;
  } catch (cause) {
    if (!isNotFound(cause)) {
      throw cause;
    }
    clone = true;
  }

  if (clone) {
    await runGit(run, ["clone", "--depth", "1", DEFAULT_OUTFITTING_REPO_URL, root], {
      cwd: dirname(root),
      inherit: true,
    });
  } else {
    const status = await runGit(run, ["-C", root, "status", "--porcelain"], {
      inherit: false,
    });
    if (status.stdout.trim().length > 0) {
      throw new Error(
        `Outfitting repository at ${root} has uncommitted changes; refusing to pull.`,
      );
    }
  }

  await runGit(run, ["-C", root, "fetch", "--prune", "origin", options.ref], {
    inherit: true,
  });
  await runGit(run, ["-C", root, "checkout", "--detach", "FETCH_HEAD"], {
    inherit: true,
  });

  return validateOutfittingRepo(root);
}

async function runGit(
  run: typeof runCommand,
  args: ReadonlyArray<string>,
  options: Parameters<typeof runCommand>[2],
) {
  const result = await run("git", args, options);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(
      `git ${args.join(" ")} failed (exit ${result.code})${detail.length > 0 ? `: ${detail}` : "."}`,
    );
  }
  return result;
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
