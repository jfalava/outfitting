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
import { selectByorProfile, tryReadByorContract } from "@/source/contract";

export const DEFAULT_OUTFITTING_REPO_URL = "https://github.com/jfalava/outfitting.git";

/** Paths that identify a valid Outfitting source (full checkout or sparse tree). */
const SOURCE_MARKERS = [
  join("system", "macos", "flake.nix"),
  join("system", "oci-agents", "flake.nix"),
  join("system", "ubuntu-wsl", "flake.nix"),
  join("packages", "linux", "generic-linux.txt"),
] as const;

/** Which Nix flake root a checkout is driving. */
export type NixFlakeKind = "macos" | "home-manager" | "none";

export interface OutfittingRepo {
  /** Absolute path to the full repository or sparse source root. */
  root: string;
  /**
   * Absolute path to the active flake root (`system/macos`, `system/oci-agents`,
   * or `system/ubuntu-wsl`). Empty when the source has no Nix flake (generic-linux).
   */
  flakePath: string;
  /** Absolute path to `system/macos/darwin.nix` when present; otherwise empty. */
  darwinNixPath: string;
  /** Active flake kind derived from on-disk markers and optional Linux profile. */
  flakeKind: NixFlakeKind;
  /**
   * Flake output attribute for build/switch.
   * macOS: `darwinConfigurations.macos.system`
   * Home Manager: `homeConfigurations.<name>.activationPackage`
   */
  systemAttr: string;
  /** Home Manager configuration name when flakeKind is home-manager. */
  homeManagerName?: string;
}

interface FlakeSelection {
  flakePath: string;
  darwinNixPath: string;
  flakeKind: NixFlakeKind;
  systemAttr: string;
  homeManagerName?: string;
}

const MACOS_SYSTEM_ATTR = "darwinConfigurations.macos.system";

function homeManagerSystemAttr(name: string): string {
  return `homeConfigurations.${name}.activationPackage`;
}

function selectFlake(absolute: string, profile?: string): FlakeSelection {
  const macosFlake = join(absolute, "system", "macos");
  const ociFlake = join(absolute, "system", "oci-agents");
  const wslFlake = join(absolute, "system", "ubuntu-wsl");
  const macosDarwin = join(macosFlake, "darwin.nix");

  // Prefer an explicit Linux profile when the matching flake exists.
  if (profile === "oci-agents") {
    return {
      flakePath: ociFlake,
      darwinNixPath: "",
      flakeKind: "home-manager",
      systemAttr: homeManagerSystemAttr("oci-agents"),
      homeManagerName: "oci-agents",
    };
  }
  if (profile === "ubuntu-wsl") {
    return {
      flakePath: wslFlake,
      darwinNixPath: "",
      flakeKind: "home-manager",
      systemAttr: homeManagerSystemAttr("jfalava"),
      homeManagerName: "jfalava",
    };
  }

  // Marker priority for full checkouts without a Linux profile: macOS first,
  // then headless HM profiles (oci-agents before WSL).
  return {
    flakePath: macosFlake,
    darwinNixPath: macosDarwin,
    flakeKind: "macos",
    systemAttr: MACOS_SYSTEM_ATTR,
  };
}

async function resolveFlakeSelection(
  absolute: string,
  profile: string | undefined,
  markersPresent: boolean[],
): Promise<FlakeSelection> {
  const hasMacos = markersPresent[0] === true;
  const hasOci = markersPresent[1] === true;
  const hasWsl = markersPresent[2] === true;

  if (profile === "oci-agents") {
    if (!hasOci) {
      throw new Error(
        `Linux profile oci-agents requires ${join(absolute, "system", "oci-agents", "flake.nix")}.`,
      );
    }
    return selectFlake(absolute, "oci-agents");
  }
  if (profile === "ubuntu-wsl") {
    if (!hasWsl) {
      throw new Error(
        `Linux profile ubuntu-wsl requires ${join(absolute, "system", "ubuntu-wsl", "flake.nix")}.`,
      );
    }
    return selectFlake(absolute, "ubuntu-wsl");
  }

  // generic-linux (and unknown profiles): never bind a flake just because the
  // monorepo checkout also contains macOS/HM trees.
  if (profile === "generic-linux") {
    return {
      flakePath: "",
      darwinNixPath: "",
      flakeKind: "none",
      systemAttr: "",
    };
  }

  if (hasMacos) {
    return selectFlake(absolute);
  }
  if (hasOci) {
    return selectFlake(absolute, "oci-agents");
  }
  if (hasWsl) {
    return selectFlake(absolute, "ubuntu-wsl");
  }

  // generic-linux (or other non-Nix source): no flake root.
  return {
    flakePath: "",
    darwinNixPath: "",
    flakeKind: "none",
    systemAttr: "",
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveByorFlakeSelection(
  absolute: string,
  profile: string | undefined,
): Promise<FlakeSelection | undefined> {
  const contract = await tryReadByorContract(absolute);
  if (contract === undefined) {
    return undefined;
  }

  const selected = selectByorProfile(contract, profile);
  if (selected.linux.nix === undefined) {
    return {
      flakePath: "",
      darwinNixPath: "",
      flakeKind: "none",
      systemAttr: "",
    };
  }

  const flakePath = join(absolute, selected.linux.nix.flake);
  if (!(await pathExists(join(flakePath, "flake.nix")))) {
    throw new Error(
      `BYOR profile \`${selected.name}\` declares a missing Nix flake at ${join(flakePath, "flake.nix")}.`,
    );
  }
  return {
    flakePath,
    darwinNixPath: "",
    flakeKind: "home-manager",
    systemAttr: selected.linux.nix.attribute,
    homeManagerName: selected.name,
  };
}

async function validateLegacyRepo(
  absolute: string,
  profile: string | undefined,
): Promise<OutfittingRepo> {
  const markers = SOURCE_MARKERS.map((relative) => join(absolute, relative));
  const present = await Promise.all(markers.map((path) => pathExists(path)));
  if (!present.some(Boolean)) {
    throw new Error(
      `Outfitting repo at ${absolute} is missing a recognized source marker (system/macos, system/oci-agents, system/ubuntu-wsl, or packages/linux/generic-linux.txt). Check OUTFITTING_REPO / repo-path.`,
    );
  }

  const selection = await resolveFlakeSelection(absolute, profile, present);
  if (
    (profile === "oci-agents" || profile === "ubuntu-wsl") &&
    selection.flakeKind === "home-manager"
  ) {
    const flakeNix = join(selection.flakePath, "flake.nix");
    if (!(await pathExists(flakeNix))) {
      throw new Error(`Missing flake at ${flakeNix}.`);
    }
  }

  return {
    root: absolute,
    flakePath: selection.flakePath,
    darwinNixPath: selection.darwinNixPath,
    flakeKind: selection.flakeKind,
    systemAttr: selection.systemAttr,
    homeManagerName: selection.homeManagerName,
  };
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
export async function validateOutfittingRepo(
  candidate: string,
  options?: { profile?: string },
): Promise<OutfittingRepo> {
  let absolute: string;
  try {
    absolute = isAbsolute(candidate) ? candidate : resolve(candidate);
    absolute = await realpath(absolute);
  } catch {
    throw new Error(`Outfitting repository path does not exist: ${candidate}`);
  }

  const byorSelection = await resolveByorFlakeSelection(absolute, options?.profile);
  if (byorSelection !== undefined) {
    return {
      root: absolute,
      ...byorSelection,
    };
  }

  return validateLegacyRepo(absolute, options?.profile);
}

/**
 * Persist a repository or sparse source path to the legacy `repo-path` file (mode 600).
 * Matches `set_outfitting_repo` so shell and manager share one source of truth.
 */
export async function writeRepoPath(
  repoRoot: string,
  options?: { stateRoot?: string; profile?: string },
): Promise<{ repo: OutfittingRepo; pathFile: string }> {
  const config = await loadConfig(
    options?.stateRoot === undefined ? undefined : { stateRoot: options.stateRoot },
  );
  const profile = options?.profile ?? config.linux?.profile;
  const repo = await validateOutfittingRepo(repoRoot, { profile });
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
 * Pass `profile` (or rely on `config.linux.profile`) so Linux HM flakes resolve correctly.
 */
export async function resolveOutfittingRepo(options?: {
  config?: ManagerConfig;
  envRepo?: string;
  profile?: string;
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

  const profile = options?.profile ?? config.linux?.profile;
  return validateOutfittingRepo(candidate, { profile });
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
