import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { loadConfig } from "@/config/load";
import { sparseSourceRoot } from "@/config/paths";
import { configuredProfile } from "@/config/profile";
import type { ManagerConfig } from "@/config/types";
import type { HostPlatform } from "@/platform";
import { envValue } from "@/secrets";
import { syncByorSparseSource } from "@/setup/source";
import {
  macosDarwinRelativePath,
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
  /** Declarations loaded from the machine's authoritative config.toml. */
  contract: ByorContract;
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
  contract: ByorContract,
  profile: string | undefined,
): Promise<FlakeSelection> {
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

/** Validate a source root against declarations loaded from config.toml. */
export async function validateOutfittingRepo(
  candidate: string,
  options: { contract: ByorContract; profile?: string; platform?: HostPlatform },
): Promise<OutfittingRepo> {
  let absolute: string;
  try {
    absolute = isAbsolute(candidate) ? candidate : resolve(candidate);
    absolute = await realpath(absolute);
  } catch {
    throw new Error(`Outfitting repository path does not exist: ${candidate}`);
  }

  const selection =
    options.platform === "windows"
      ? { flakePath: "", darwinNixPath: "", flakeKind: "none" as const, systemAttr: "" }
      : await resolveByorFlakeSelection(absolute, options.contract, options.profile);
  return { root: absolute, contract: options.contract, ...selection };
}

function requireDeclarations(config: ManagerConfig): ByorContract {
  if (config.declarations === undefined) {
    throw new Error(`No profile declarations are configured in ${config.configPath}.`);
  }
  return config.declarations;
}

async function resolveRepositoryRoot(options: {
  config: ManagerConfig;
  override?: string;
  platform?: HostPlatform;
  profile?: string;
}): Promise<string> {
  const configured = options.config.source;
  if (options.override === undefined && configured === undefined) {
    throw new Error(
      `Machine source is not configured. Set [source] in ${options.config.configPath} or OUTFITTING_REPO for a local checkout.`,
    );
  }
  if (options.override === undefined && configured?.kind === "remote") {
    if (options.platform === undefined) {
      throw new Error("A platform is required to validate the configured remote source cache.");
    }
    const profile = configuredProfile(options.config, options.platform, options.profile);
    await syncByorSparseSource({
      config: options.config,
      platform: options.platform,
      profile,
      offline: true,
    });
  }
  if (options.override !== undefined) {
    return options.override;
  }
  if (configured?.kind === "local") {
    return configured.path;
  }
  return sparseSourceRoot(options.config.stateRoot);
}

/** Resolve source with command/env path overrides ahead of the TOML declaration. */
export async function resolveOutfittingRepo(options?: {
  config?: ManagerConfig;
  envRepo?: string;
  profile?: string;
  platform?: HostPlatform;
}): Promise<OutfittingRepo> {
  const config = options?.config ?? (await loadConfig());
  const contract = requireDeclarations(config);
  const override = options?.envRepo ?? envValue("OUTFITTING_REPO");
  const platform = options?.platform;
  const profile =
    platform === undefined
      ? options?.profile
      : configuredProfile(config, platform, options?.profile);
  const candidate = await resolveRepositoryRoot({ config, override, platform, profile });
  return validateOutfittingRepo(candidate, { contract, profile, platform });
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
