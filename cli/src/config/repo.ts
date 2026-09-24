import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { loadConfig } from "@/config/load";
import { repoPathFile } from "@/config/paths";
import type { ManagerConfig } from "@/config/types";
import { envValue } from "@/secrets";
import {
  macosDarwinRelativePath,
  readByorContract,
  selectByorProfile,
  selectMacosByorProfile,
  type ByorContract,
  type ByorProfileDeclaration,
} from "@/source/contract";

/** Which Nix flake root a checkout is driving. */
export type NixFlakeKind = "macos" | "home-manager" | "none";

export interface OutfittingRepo {
  /** Absolute path to the full repository or published source root. */
  root: string;
  /** Absolute path to the flake root declared by the selected BYOR profile. */
  flakePath: string;
  /** Absolute path to the declared Darwin configuration file when present; otherwise empty. */
  darwinNixPath: string;
  /** Active flake kind declared by the selected BYOR profile. */
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function profileNamesWith(
  contract: ByorContract,
  predicate: (entry: ByorProfileDeclaration) => boolean,
): string[] {
  return Object.keys(contract.profiles).filter((name) => {
    const entry = contract.profiles[name];
    return entry !== undefined && predicate(entry);
  });
}

type ByorFlakeKind = "macos" | "linux" | "none";

interface ByorFlakeInventory {
  macos: string[];
  linuxNix: string[];
  linuxAny: string[];
}

function inventoryByorFlakes(contract: ByorContract): ByorFlakeInventory {
  return {
    macos: profileNamesWith(contract, (entry) => entry.macos !== undefined),
    linuxNix: profileNamesWith(contract, (entry) => entry.linux?.nix !== undefined),
    linuxAny: profileNamesWith(contract, (entry) => entry.linux !== undefined),
  };
}

function kindFromEntry(entry: ByorProfileDeclaration | undefined): ByorFlakeKind | undefined {
  if (entry === undefined) {
    return undefined;
  }
  if (entry.macos !== undefined) {
    return "macos";
  }
  if (entry.linux !== undefined) {
    return entry.linux.nix !== undefined ? "linux" : "none";
  }
  if (entry.windows !== undefined) {
    return "none";
  }
  return undefined;
}

/** Unknown profile name: pick a selector platform so select* can list choices. */
function kindForUnknownProfile(inv: ByorFlakeInventory): ByorFlakeKind {
  if (inv.linuxAny.length > 0) {
    return "linux";
  }
  if (inv.macos.length > 0) {
    return "macos";
  }
  return "none";
}

function throwAmbiguousByorProfiles(inv: ByorFlakeInventory): never {
  const choices = [
    ...inv.macos.map((name) => `${name} (macos)`),
    ...inv.linuxNix.map((name) => `${name} (linux)`),
  ];
  throw new Error(
    `The BYOR repository defines multiple Nix profiles. Pass --profile (${choices.join(", ")}).`,
  );
}

function uniqueFlakeKind(inv: ByorFlakeInventory): ByorFlakeKind | undefined {
  const flakeNames = [...new Set([...inv.macos, ...inv.linuxNix])];
  if (flakeNames.length !== 1) {
    return undefined;
  }
  return inv.macos.includes(flakeNames[0]!) ? "macos" : "linux";
}

function hostPreferredKind(inv: ByorFlakeInventory): ByorFlakeKind | undefined {
  if (process.platform === "darwin" && inv.macos.length === 1) {
    return "macos";
  }
  if (process.platform !== "darwin" && inv.linuxNix.length === 1) {
    return "linux";
  }
  return undefined;
}

/**
 * Auto-select flake platform when `--profile` is omitted.
 * Prefer host platform when both Linux and macOS nix profiles exist.
 */
function defaultByorFlakeKind(inv: ByorFlakeInventory): ByorFlakeKind {
  if (inv.macos.length === 0 && inv.linuxNix.length === 0) {
    return "none";
  }
  // Exactly one macos profile and no linux → macos
  if (inv.macos.length === 1 && inv.linuxAny.length === 0) {
    return "macos";
  }
  // Exactly one linux.nix profile and no macos → linux
  if (inv.linuxNix.length === 1 && inv.macos.length === 0) {
    return "linux";
  }
  return uniqueFlakeKind(inv) ?? hostPreferredKind(inv) ?? throwAmbiguousByorProfiles(inv);
}

/**
 * Choose which platform flake a BYOR checkout should drive.
 * Prefer the host platform when both Linux and macOS nix profiles exist.
 */
function resolveByorPlatformKind(
  contract: ByorContract,
  profile: string | undefined,
): ByorFlakeKind {
  const inv = inventoryByorFlakes(contract);
  if (profile === undefined) {
    return defaultByorFlakeKind(inv);
  }
  return kindFromEntry(contract.profiles[profile]) ?? kindForUnknownProfile(inv);
}

async function resolveByorFlakeSelection(
  absolute: string,
  profile: string | undefined,
): Promise<FlakeSelection> {
  const contract = await readByorContract(absolute);
  const kind = resolveByorPlatformKind(contract, profile);
  if (kind === "none") {
    return {
      flakePath: "",
      darwinNixPath: "",
      flakeKind: "none",
      systemAttr: "",
    };
  }

  if (kind === "macos") {
    const selected = selectMacosByorProfile(contract, profile);
    const flakePath = join(absolute, selected.macos.nix.flake);
    if (!(await pathExists(join(flakePath, "flake.nix")))) {
      throw new Error(
        `BYOR profile \`${selected.name}\` declares a missing Nix flake at ${join(flakePath, "flake.nix")}.`,
      );
    }
    const darwinRelative = macosDarwinRelativePath(selected.macos.nix);
    return {
      flakePath,
      darwinNixPath: join(absolute, darwinRelative),
      flakeKind: "macos",
      systemAttr: selected.macos.nix.attribute,
    };
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

/** Validate a repository source root. A valid source always has outfitting.json. */
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

  const selection = await resolveByorFlakeSelection(absolute, options?.profile);
  return { root: absolute, ...selection };
}

/**
 * Persist a selected local or published source path (mode 600).
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

/**
 * Resolve the selected source.
 * Precedence: `OUTFITTING_REPO` → saved source path → fail.
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
      "Machine source is not configured. Set OUTFITTING_REPO to a checkout containing outfitting.json or run outfitting-manager byor.",
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
