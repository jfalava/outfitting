import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { Result, Schema } from "effect";

import { parseLinuxPackageManifest } from "@/source/linux-manifest";
import { isLinuxProfile, type LinuxProfile } from "@/source/linux-profile";
import { parseWindowsPackageList } from "@/source/windows-manifest";

export const BYOR_CONTRACT_PATH = "outfitting.json";
export const BYOR_CONTRACT_SCHEMA = 1;

/** Sentinel winget path template for BYOR contracts without a common `{profile}` pattern. */
export const BYOR_WINDOWS_WINGET_SENTINEL = "byor/{profile}";

export type LinuxPackageBackend = "apt" | "pacman";

export interface LinuxPackageDeclaration {
  manifest: string;
}

export interface LinuxNixDeclaration {
  flake: string;
  attribute: string;
}

export interface LinuxProfileDeclaration {
  apt?: LinuxPackageDeclaration;
  pacman?: LinuxPackageDeclaration;
  nix?: LinuxNixDeclaration;
  /**
   * Files outside the flake directory that Nix reads from the sparse source.
   * An empty array means the user confirmed there are no out-of-flake reads.
   */
  paths?: string[];
}

export interface WindowsWingetDeclaration {
  manifest: string;
}

export interface WindowsPathDeclaration {
  path: string;
}

export interface WindowsManifestDeclaration {
  manifest: string;
}

export interface WindowsProfileDeclaration {
  winget: WindowsWingetDeclaration;
}

export interface MacosNixDeclaration {
  flake: string;
  attribute: string;
  /** Repository-relative darwin.nix path; defaults to `<flake>/darwin.nix`. */
  darwin?: string;
}

export interface MacosFontsDeclaration {
  manifest: string;
}

export interface MacosProfileDeclaration {
  nix: MacosNixDeclaration;
  brewfile?: string;
  fonts?: MacosFontsDeclaration;
  /**
   * Extra repository-relative paths that must exist as files.
   * An empty array means the user confirmed there are no out-of-flake reads.
   */
  paths?: string[];
}

export interface ByorWindowsShared {
  defaultProfiles?: string[];
  scoop?: WindowsManifestDeclaration;
  powershell?: WindowsPathDeclaration;
  fonts?: WindowsManifestDeclaration;
  registry?: WindowsPathDeclaration;
}

export interface ByorProfileDeclaration {
  linux?: LinuxProfileDeclaration;
  windows?: WindowsProfileDeclaration;
  macos?: MacosProfileDeclaration;
}

export interface ByorContract {
  schema: typeof BYOR_CONTRACT_SCHEMA;
  windows?: ByorWindowsShared;
  profiles: Readonly<Record<string, ByorProfileDeclaration>>;
}

export interface SelectedByorProfile {
  name: LinuxProfile;
  linux: LinuxProfileDeclaration;
}

export interface SelectedMacosByorProfile {
  name: LinuxProfile;
  macos: MacosProfileDeclaration;
}

export interface SelectedWindowsByorProfiles {
  names: string[];
  wingetPaths: Record<string, string>;
  shared: ByorWindowsShared | undefined;
}

export interface ValidatedLinuxByorProfile {
  root: string;
  profile: LinuxProfile;
  contract: ByorContract;
  linux: LinuxProfileDeclaration;
  backends: ReadonlyArray<LinuxPackageBackend | "nix">;
}

export interface ValidatedMacosByorProfile {
  root: string;
  profile: LinuxProfile;
  contract: ByorContract;
  macos: MacosProfileDeclaration;
  /** Absolute flake directory (contains flake.nix). */
  flakePath: string;
  /** Absolute darwin.nix path. */
  darwinNixPath: string;
  systemAttr: string;
}

export interface ValidatedWindowsByorSource {
  root: string;
  names: string[];
  wingetPaths: Record<string, string>;
  shared: ByorWindowsShared | undefined;
  contract: ByorContract;
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const PackageDeclarationSchema = Schema.Struct({
  manifest: Schema.String,
});

const NixDeclarationSchema = Schema.Struct({
  flake: Schema.String,
  attribute: Schema.String,
});

const LinuxProfileSchema = Schema.Struct({
  apt: Schema.optionalKey(PackageDeclarationSchema),
  pacman: Schema.optionalKey(PackageDeclarationSchema),
  nix: Schema.optionalKey(NixDeclarationSchema),
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
});

const WindowsWingetSchema = Schema.Struct({
  manifest: Schema.String,
});

const WindowsProfileSchema = Schema.Struct({
  winget: WindowsWingetSchema,
});

const MacosNixSchema = Schema.Struct({
  flake: Schema.String,
  attribute: Schema.String,
  darwin: Schema.optionalKey(Schema.String),
});

const MacosFontsSchema = Schema.Struct({
  manifest: Schema.String,
});

const MacosProfileSchema = Schema.Struct({
  nix: MacosNixSchema,
  brewfile: Schema.optionalKey(Schema.String),
  fonts: Schema.optionalKey(MacosFontsSchema),
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
});

const WindowsPathSchema = Schema.Struct({
  path: Schema.String,
});

const WindowsManifestSchema = Schema.Struct({
  manifest: Schema.String,
});

const ByorWindowsSharedSchema = Schema.Struct({
  defaultProfiles: Schema.optionalKey(Schema.Array(Schema.String)),
  scoop: Schema.optionalKey(WindowsManifestSchema),
  powershell: Schema.optionalKey(WindowsPathSchema),
  fonts: Schema.optionalKey(WindowsManifestSchema),
  registry: Schema.optionalKey(WindowsPathSchema),
});

const ByorProfileSchema = Schema.Struct({
  linux: Schema.optionalKey(LinuxProfileSchema),
  windows: Schema.optionalKey(WindowsProfileSchema),
  macos: Schema.optionalKey(MacosProfileSchema),
});

const ByorContractSchema = Schema.Struct({
  schema: Schema.Literal(BYOR_CONTRACT_SCHEMA),
  windows: Schema.optionalKey(ByorWindowsSharedSchema),
  profiles: Schema.Record(Schema.String, ByorProfileSchema),
});

type DecodedPackageDeclaration = Schema.Schema.Type<typeof PackageDeclarationSchema>;
type DecodedNixDeclaration = Schema.Schema.Type<typeof NixDeclarationSchema>;
type DecodedLinuxProfile = Schema.Schema.Type<typeof LinuxProfileSchema>;
type DecodedWindowsProfile = Schema.Schema.Type<typeof WindowsProfileSchema>;
type DecodedMacosProfile = Schema.Schema.Type<typeof MacosProfileSchema>;
type DecodedWindowsShared = Schema.Schema.Type<typeof ByorWindowsSharedSchema>;
type DecodedContract = Schema.Schema.Type<typeof ByorContractSchema>;

const decodeByorContract = Schema.decodeUnknownResult(ByorContractSchema);

function isEnoent(cause: unknown): boolean {
  return (
    cause instanceof Error && "code" in cause && (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function requiredString(value: string, label: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function profileName(value: string, label: string): LinuxProfile {
  const profile = requiredString(value, label);
  if (!isLinuxProfile(profile)) {
    throw new Error(`${label} must contain only letters, numbers, ., _, and -.`);
  }
  return profile;
}

/** Normalize a repository-relative path and reject traversal or platform escapes. */
export function relativeSourcePath(value: string, label: string): string {
  const path = requiredString(value, label);
  const segments = path.split("/");
  if (
    isAbsolute(path) ||
    path.includes("\\") ||
    /^[A-Za-z]:/.test(path) ||
    segments.some((segment) => segment.length === 0 || segment === "..")
  ) {
    throw new Error(`${label} must be a repository-relative path without traversal.`);
  }
  return segments.filter((segment) => segment !== ".").join("/") || ".";
}

function parsePackageDeclaration(
  value: DecodedPackageDeclaration,
  label: string,
): LinuxPackageDeclaration {
  return {
    manifest: relativeSourcePath(value.manifest, `${label}.manifest`),
  };
}

function parseNixAttribute(value: string, label: string): string {
  const attribute = requiredString(value, label);
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(attribute)) {
    throw new Error(`${label} must be a dot-separated Nix attribute path.`);
  }
  return attribute;
}

function parseNixDeclaration(value: DecodedNixDeclaration, label: string): LinuxNixDeclaration {
  return {
    flake: relativeSourcePath(value.flake, `${label}.flake`),
    attribute: parseNixAttribute(value.attribute, `${label}.attribute`),
  };
}

function parseMacosNixDeclaration(
  value: DecodedMacosProfile["nix"],
  label: string,
): MacosNixDeclaration {
  const flake = relativeSourcePath(value.flake, `${label}.flake`);
  const nix: MacosNixDeclaration = {
    flake,
    attribute: parseNixAttribute(value.attribute, `${label}.attribute`),
  };
  if (value.darwin !== undefined) {
    nix.darwin = relativeSourcePath(value.darwin, `${label}.darwin`);
  }
  return nix;
}

function parseLinuxProfile(value: DecodedLinuxProfile, label: string): LinuxProfileDeclaration {
  const linux: LinuxProfileDeclaration = {};
  if (value.apt !== undefined) {
    linux.apt = parsePackageDeclaration(value.apt, `${label}.apt`);
  }
  if (value.pacman !== undefined) {
    linux.pacman = parsePackageDeclaration(value.pacman, `${label}.pacman`);
  }
  if (value.nix !== undefined) {
    linux.nix = parseNixDeclaration(value.nix, `${label}.nix`);
  }
  if (value.paths !== undefined) {
    linux.paths = value.paths.map((path, index) =>
      relativeSourcePath(path, `${label}.paths[${index}]`),
    );
  }
  if (linux.apt === undefined && linux.pacman === undefined && linux.nix === undefined) {
    throw new Error(`${label} must declare apt, pacman, or nix.`);
  }
  return linux;
}

function parseWindowsProfile(
  value: DecodedWindowsProfile,
  label: string,
): WindowsProfileDeclaration {
  return {
    winget: {
      manifest: relativeSourcePath(value.winget.manifest, `${label}.winget.manifest`),
    },
  };
}

function parseMacosProfile(value: DecodedMacosProfile, label: string): MacosProfileDeclaration {
  const macos: MacosProfileDeclaration = {
    nix: parseMacosNixDeclaration(value.nix, `${label}.nix`),
  };
  if (value.brewfile !== undefined) {
    macos.brewfile = relativeSourcePath(value.brewfile, `${label}.brewfile`);
  }
  if (value.fonts !== undefined) {
    macos.fonts = {
      manifest: relativeSourcePath(value.fonts.manifest, `${label}.fonts.manifest`),
    };
  }
  if (value.paths !== undefined) {
    macos.paths = value.paths.map((path, index) =>
      relativeSourcePath(path, `${label}.paths[${index}]`),
    );
  }
  return macos;
}

function parseWindowsShared(value: DecodedWindowsShared): ByorWindowsShared {
  const shared: ByorWindowsShared = {};
  if (value.defaultProfiles !== undefined) {
    if (value.defaultProfiles.length === 0) {
      throw new Error(`${BYOR_CONTRACT_PATH}.windows.defaultProfiles must not be empty.`);
    }
    shared.defaultProfiles = [
      ...new Set(
        value.defaultProfiles.map((name, index) =>
          profileName(name, `${BYOR_CONTRACT_PATH}.windows.defaultProfiles[${index}]`),
        ),
      ),
    ];
  }
  if (value.scoop !== undefined) {
    shared.scoop = {
      manifest: relativeSourcePath(
        value.scoop.manifest,
        `${BYOR_CONTRACT_PATH}.windows.scoop.manifest`,
      ),
    };
  }
  if (value.powershell !== undefined) {
    shared.powershell = {
      path: relativeSourcePath(
        value.powershell.path,
        `${BYOR_CONTRACT_PATH}.windows.powershell.path`,
      ),
    };
  }
  if (value.fonts !== undefined) {
    shared.fonts = {
      manifest: relativeSourcePath(
        value.fonts.manifest,
        `${BYOR_CONTRACT_PATH}.windows.fonts.manifest`,
      ),
    };
  }
  if (value.registry !== undefined) {
    shared.registry = {
      path: relativeSourcePath(value.registry.path, `${BYOR_CONTRACT_PATH}.windows.registry.path`),
    };
  }
  return shared;
}

function decodeContractRoot(value: JsonValue): DecodedContract {
  const decoded = decodeByorContract(value);
  if (Result.isFailure(decoded)) {
    const detail = decoded.failure.message.trim();
    throw new Error(
      detail.length > 0
        ? `${BYOR_CONTRACT_PATH} is invalid:\n${detail}`
        : `${BYOR_CONTRACT_PATH} must match schema ${BYOR_CONTRACT_SCHEMA}.`,
    );
  }
  if (Object.keys(decoded.success.profiles).length === 0) {
    throw new Error(`${BYOR_CONTRACT_PATH}.profiles must contain at least one profile.`);
  }
  return decoded.success;
}

interface ParsedProfileEntry {
  name: string;
  profile: ByorProfileDeclaration;
}

function parseProfileEntry(
  rawName: string,
  valueForProfile: DecodedContract["profiles"][string],
): ParsedProfileEntry {
  const name = profileName(rawName, `${BYOR_CONTRACT_PATH}.profiles profile name`);
  const profile: ByorProfileDeclaration = {};
  if (valueForProfile.linux !== undefined) {
    profile.linux = parseLinuxProfile(valueForProfile.linux, `${name}.linux`);
  }
  if (valueForProfile.windows !== undefined) {
    profile.windows = parseWindowsProfile(valueForProfile.windows, `${name}.windows`);
  }
  if (valueForProfile.macos !== undefined) {
    profile.macos = parseMacosProfile(valueForProfile.macos, `${name}.macos`);
  }
  if (profile.linux === undefined && profile.windows === undefined && profile.macos === undefined) {
    throw new Error(`${name} must declare linux, windows, and/or macos.`);
  }
  return { name, profile };
}

function parseOptionalWindowsShared(
  raw: DecodedWindowsShared | undefined,
  profiles: Record<string, ByorProfileDeclaration>,
): ByorWindowsShared | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const windows = parseWindowsShared(raw);
  for (const name of windows.defaultProfiles ?? []) {
    if (profiles[name]?.windows === undefined) {
      throw new Error(
        `${BYOR_CONTRACT_PATH}.windows.defaultProfiles references unknown Windows profile \`${name}\`.`,
      );
    }
  }
  return windows;
}

/** Parse and validate the repository-owned BYOR contract. */
export function parseByorContract(value: JsonValue): ByorContract {
  const contract = decodeContractRoot(value);
  const profiles: Record<string, ByorProfileDeclaration> = {};
  for (const [rawName, valueForProfile] of Object.entries(contract.profiles)) {
    const parsed = parseProfileEntry(rawName, valueForProfile);
    profiles[parsed.name] = parsed.profile;
  }
  const windows = parseOptionalWindowsShared(contract.windows, profiles);
  return windows === undefined
    ? { schema: BYOR_CONTRACT_SCHEMA, profiles }
    : { schema: BYOR_CONTRACT_SCHEMA, windows, profiles };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function linuxProfileNames(contract: ByorContract): string[] {
  return Object.keys(contract.profiles).filter(
    (name) => contract.profiles[name]?.linux !== undefined,
  );
}

function windowsProfileNames(contract: ByorContract): string[] {
  return Object.keys(contract.profiles).filter(
    (name) => contract.profiles[name]?.windows !== undefined,
  );
}

function macosProfileNames(contract: ByorContract): string[] {
  return Object.keys(contract.profiles).filter(
    (name) => contract.profiles[name]?.macos !== undefined,
  );
}

/** Default darwin.nix path relative to the repository root for a macOS flake. */
export function macosDarwinRelativePath(nix: MacosNixDeclaration): string {
  return nix.darwin ?? `${nix.flake}/darwin.nix`;
}

/**
 * Repository-relative files and complete flake directory a macOS profile fetches.
 */
export function macosPathsFromProfile(decl: MacosProfileDeclaration): string[] {
  const paths = [decl.nix.flake, macosDarwinRelativePath(decl.nix)];
  if (decl.brewfile !== undefined) {
    paths.push(decl.brewfile);
  }
  if (decl.fonts !== undefined) {
    paths.push(decl.fonts.manifest);
  }
  if (decl.paths !== undefined) {
    paths.push(...decl.paths);
  }
  return paths;
}

/**
 * Select a Linux profile from a parsed contract.
 * Shared by validation and flake resolution so messages and defaults stay identical.
 */
export function selectByorProfile(
  contract: ByorContract,
  requested: string | undefined,
): SelectedByorProfile {
  const linuxNames = linuxProfileNames(contract);
  if (linuxNames.length === 0) {
    throw new Error(`${BYOR_CONTRACT_PATH} does not declare any Linux profiles.`);
  }
  if (requested !== undefined) {
    const name = profileName(requested, "--profile");
    const profile = contract.profiles[name];
    if (profile?.linux === undefined) {
      throw new Error(`Unknown BYOR Linux profile \`${name}\`. Choose: ${linuxNames.join(", ")}.`);
    }
    return { name, linux: profile.linux };
  }

  if (linuxNames.length !== 1) {
    throw new Error(
      `The BYOR repository defines multiple profiles. Pass --profile (${linuxNames.join(", ")}).`,
    );
  }
  const name = profileName(linuxNames[0]!, `${BYOR_CONTRACT_PATH}.profiles profile name`);
  const profile = contract.profiles[name];
  if (profile?.linux === undefined) {
    throw new Error(`Unknown BYOR Linux profile \`${name}\`.`);
  }
  return { name, linux: profile.linux };
}

/**
 * Select a macOS profile from a parsed contract.
 * macOS profiles are exclusive (one at a time), like Linux.
 */
export function selectMacosByorProfile(
  contract: ByorContract,
  requested: string | undefined,
): SelectedMacosByorProfile {
  const macosNames = macosProfileNames(contract);
  if (macosNames.length === 0) {
    throw new Error(`${BYOR_CONTRACT_PATH} does not declare any macOS profiles.`);
  }
  if (requested !== undefined) {
    const name = profileName(requested, "--profile");
    const profile = contract.profiles[name];
    if (profile?.macos === undefined) {
      throw new Error(`Unknown BYOR macOS profile \`${name}\`. Choose: ${macosNames.join(", ")}.`);
    }
    return { name, macos: profile.macos };
  }

  if (macosNames.length !== 1) {
    throw new Error(
      `The BYOR repository defines multiple macOS profiles. Pass --profile (${macosNames.join(", ")}).`,
    );
  }
  const name = profileName(macosNames[0]!, `${BYOR_CONTRACT_PATH}.profiles profile name`);
  const profile = contract.profiles[name];
  if (profile?.macos === undefined) {
    throw new Error(`Unknown BYOR macOS profile \`${name}\`.`);
  }
  return { name, macos: profile.macos };
}

/**
 * Select one or more Windows profiles from a parsed contract.
 * Supports comma-composed names (Windows profiles are composable).
 */
export function selectWindowsByorProfiles(
  contract: ByorContract,
  requested: string[] | undefined,
): SelectedWindowsByorProfiles {
  const available = windowsProfileNames(contract);
  if (available.length === 0) {
    throw new Error(`${BYOR_CONTRACT_PATH} does not declare any Windows profiles.`);
  }

  const defaults =
    contract.windows?.defaultProfiles !== undefined && contract.windows.defaultProfiles.length > 0
      ? contract.windows.defaultProfiles
      : available;

  const rawRequested =
    requested === undefined || requested.length === 0
      ? defaults
      : requested.flatMap((value) => value.split(","));

  const names = [
    ...new Set(rawRequested.map((value) => profileName(value.trim(), "--profile")).filter(Boolean)),
  ];
  if (names.length === 0) {
    throw new Error("At least one Windows profile must be selected.");
  }

  const wingetPaths: Record<string, string> = {};
  for (const name of names) {
    const profile = contract.profiles[name];
    if (profile?.windows === undefined) {
      throw new Error(`Unknown BYOR Windows profile \`${name}\`. Choose: ${available.join(", ")}.`);
    }
    wingetPaths[name] = profile.windows.winget.manifest;
  }

  return { names, wingetPaths, shared: contract.windows };
}

function pushUnique(paths: string[], path: string): void {
  if (!paths.includes(path)) {
    paths.push(path);
  }
}

/** Repository-relative files and flake directories a Linux profile declares. */
export function linuxPathsFromProfile(decl: LinuxProfileDeclaration): string[] {
  const paths: string[] = [];
  if (decl.apt !== undefined) {
    pushUnique(paths, decl.apt.manifest);
  }
  if (decl.pacman !== undefined) {
    pushUnique(paths, decl.pacman.manifest);
  }
  if (decl.nix !== undefined) {
    pushUnique(paths, decl.nix.flake);
  }
  for (const path of decl.paths ?? []) {
    pushUnique(paths, path);
  }
  return paths;
}

/**
 * Repository-relative Windows files for the selected profiles.
 * Shared scoop, PowerShell, fonts, and registry paths are included only when declared.
 */
export function windowsPathsFromContract(
  contract: ByorContract,
  requested: string[] | undefined,
): string[] {
  const selected = selectWindowsByorProfiles(contract, requested);
  const paths: string[] = [];
  for (const name of selected.names) {
    const manifest = selected.wingetPaths[name];
    if (manifest !== undefined) {
      pushUnique(paths, manifest);
    }
  }
  const shared = selected.shared;
  if (shared?.scoop !== undefined) {
    pushUnique(paths, shared.scoop.manifest);
  }
  if (shared?.powershell !== undefined) {
    pushUnique(paths, shared.powershell.path);
  }
  if (shared?.fonts !== undefined) {
    pushUnique(paths, shared.fonts.manifest);
  }
  if (shared?.registry !== undefined) {
    pushUnique(paths, shared.registry.path);
  }
  return paths;
}

async function validatePackageBackend(options: {
  root: string;
  profile: LinuxProfile;
  backend: LinuxPackageBackend;
  declaration: LinuxPackageDeclaration;
}): Promise<LinuxPackageBackend> {
  const manifestPath = join(options.root, options.declaration.manifest);
  if (!(await fileExists(manifestPath))) {
    throw new Error(
      `BYOR profile \`${options.profile}\` declares ${options.backend} manifest ${options.declaration.manifest}, but the file is missing.`,
    );
  }
  let packages: string[];
  try {
    packages = parseLinuxPackageManifest(await readFile(manifestPath, "utf8"));
  } catch (cause) {
    throw new Error(
      `BYOR profile \`${options.profile}\` has an invalid ${options.backend} manifest ${options.declaration.manifest}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  if (packages.length === 0) {
    throw new Error(
      `BYOR profile \`${options.profile}\` has an empty ${options.backend} manifest: ${options.declaration.manifest}.`,
    );
  }
  return options.backend;
}

async function validateNixBackend(options: {
  root: string;
  profile: LinuxProfile;
  declaration: LinuxNixDeclaration;
}): Promise<"nix"> {
  const flakePath = join(options.root, options.declaration.flake, "flake.nix");
  if (!(await fileExists(flakePath))) {
    throw new Error(
      `BYOR profile \`${options.profile}\` declares Nix flake ${options.declaration.flake}, but flake.nix is missing.`,
    );
  }
  if ((await readFile(flakePath, "utf8")).trim().length === 0) {
    throw new Error(`BYOR profile \`${options.profile}\` has an empty Nix flake: ${flakePath}.`);
  }
  return "nix";
}

async function validateWingetManifest(options: {
  root: string;
  profile: string;
  manifest: string;
}): Promise<void> {
  const manifestPath = join(options.root, options.manifest);
  if (!(await fileExists(manifestPath))) {
    throw new Error(
      `BYOR profile \`${options.profile}\` declares winget manifest ${options.manifest}, but the file is missing.`,
    );
  }
  let packages: ReturnType<typeof parseWindowsPackageList>;
  try {
    packages = parseWindowsPackageList(await readFile(manifestPath, "utf8"), options.manifest);
  } catch (cause) {
    throw new Error(
      `BYOR profile \`${options.profile}\` has an invalid winget manifest ${options.manifest}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  if (packages.length === 0) {
    throw new Error(
      `BYOR profile \`${options.profile}\` has an empty winget manifest: ${options.manifest}.`,
    );
  }
}

async function validateOptionalSharedFile(options: {
  root: string;
  label: string;
  relative: string;
  parse?: (content: string) => void;
}): Promise<void> {
  const path = join(options.root, options.relative);
  if (!(await fileExists(path))) {
    throw new Error(
      `BYOR windows.${options.label} declares ${options.relative}, but the file is missing.`,
    );
  }
  const content = await readFile(path, "utf8");
  if (content.trim().length === 0) {
    throw new Error(`BYOR windows.${options.label} file is empty: ${options.relative}.`);
  }
  if (options.parse !== undefined) {
    try {
      options.parse(content);
    } catch (cause) {
      throw new Error(
        `BYOR windows.${options.label} is invalid (${options.relative}): ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  }
}

/**
 * Read and parse `outfitting.json`.
 * Missing file throws; invalid JSON or schema throws — never treated as legacy.
 */
export async function readByorContract(root: string): Promise<ByorContract> {
  let raw: string;
  try {
    raw = await readFile(join(root, BYOR_CONTRACT_PATH), "utf8");
  } catch (cause) {
    throw new Error(
      `BYOR repository is missing ${BYOR_CONTRACT_PATH}; create it at the repository root.`,
      { cause },
    );
  }

  let parsed: JsonValue;
  try {
    parsed = JSON.parse(raw) as JsonValue;
  } catch (cause) {
    throw new Error(`${BYOR_CONTRACT_PATH} is not valid JSON.`, { cause });
  }
  return parseByorContract(parsed);
}

/**
 * Load a BYOR contract when present.
 * - missing `outfitting.json` → `undefined` (legacy layout)
 * - present but invalid → throw (do not fall through to legacy markers)
 */
export async function tryReadByorContract(root: string): Promise<ByorContract | undefined> {
  let raw: string;
  try {
    raw = await readFile(join(root, BYOR_CONTRACT_PATH), "utf8");
  } catch (cause) {
    if (isEnoent(cause)) {
      return undefined;
    }
    throw cause;
  }

  let parsed: JsonValue;
  try {
    parsed = JSON.parse(raw) as JsonValue;
  } catch (cause) {
    throw new Error(`${BYOR_CONTRACT_PATH} is not valid JSON.`, { cause });
  }
  return parseByorContract(parsed);
}

/** True when the root contains a parseable BYOR contract. Invalid files throw. */
export async function hasByorContract(root: string): Promise<boolean> {
  return (await tryReadByorContract(root)) !== undefined;
}

async function resolveByorRoot(candidate: string): Promise<string> {
  let root: string;
  try {
    root = await realpath(candidate);
  } catch (cause) {
    throw new Error(`BYOR repository does not exist: ${candidate}.`, { cause });
  }
  try {
    if (!(await stat(root)).isDirectory()) {
      throw new Error("not a directory");
    }
  } catch (cause) {
    throw new Error(`BYOR repository is not a directory: ${root}.`, { cause });
  }
  return root;
}

/** Validate a user-provided Linux BYOR repository without changing the host. */
export async function validateLinuxByorSource(options: {
  root: string;
  profile?: string;
}): Promise<ValidatedLinuxByorProfile> {
  const root = await resolveByorRoot(options.root);
  const contract = await readByorContract(root);
  if (linuxProfileNames(contract).length === 0) {
    throw new Error(`${BYOR_CONTRACT_PATH} does not declare any Linux profiles.`);
  }
  const selected = selectByorProfile(contract, options.profile);
  const backends: Array<LinuxPackageBackend | "nix"> = [];

  for (const backend of ["apt", "pacman"] as const) {
    const declaration = selected.linux[backend];
    if (declaration === undefined) {
      continue;
    }
    backends.push(
      await validatePackageBackend({
        root,
        profile: selected.name,
        backend,
        declaration,
      }),
    );
  }

  if (selected.linux.nix !== undefined) {
    backends.push(
      await validateNixBackend({
        root,
        profile: selected.name,
        declaration: selected.linux.nix,
      }),
    );
  }

  return {
    root,
    profile: selected.name,
    contract,
    linux: selected.linux,
    backends,
  };
}

async function validateWindowsSharedArtifacts(
  root: string,
  shared: ByorWindowsShared | undefined,
): Promise<void> {
  if (shared === undefined) {
    return;
  }
  if (shared.scoop !== undefined) {
    const { parseScoopManifest } = await import("@/update/scoop");
    await validateOptionalSharedFile({
      root,
      label: "scoop",
      relative: shared.scoop.manifest,
      parse: (content) => {
        parseScoopManifest(content);
      },
    });
  }
  if (shared.powershell !== undefined) {
    await validateOptionalSharedFile({
      root,
      label: "powershell",
      relative: shared.powershell.path,
    });
  }
  if (shared.fonts !== undefined) {
    await validateOptionalSharedFile({
      root,
      label: "fonts",
      relative: shared.fonts.manifest,
    });
  }
  if (shared.registry !== undefined) {
    const registryPath = join(root, shared.registry.path);
    try {
      const info = await stat(registryPath);
      if (!info.isDirectory() && !info.isFile()) {
        throw new Error("missing");
      }
    } catch (cause) {
      throw new Error(
        `BYOR windows.registry declares ${shared.registry.path}, but the path is missing.`,
        { cause },
      );
    }
  }
}

/** Validate a user-provided Windows BYOR repository without changing the host. */
export async function validateWindowsByorSource(options: {
  root: string;
  profiles?: string[];
}): Promise<ValidatedWindowsByorSource> {
  const root = await resolveByorRoot(options.root);
  const contract = await readByorContract(root);
  const selected = selectWindowsByorProfiles(contract, options.profiles);

  for (const name of selected.names) {
    await validateWingetManifest({
      root,
      profile: name,
      manifest: selected.wingetPaths[name]!,
    });
  }
  await validateWindowsSharedArtifacts(root, selected.shared);

  return {
    root,
    names: selected.names,
    wingetPaths: selected.wingetPaths,
    shared: selected.shared,
    contract,
  };
}

async function validateOptionalMacosFile(options: {
  root: string;
  profile: string;
  label: string;
  relative: string;
}): Promise<void> {
  const path = join(options.root, options.relative);
  if (!(await fileExists(path))) {
    throw new Error(
      `BYOR profile \`${options.profile}\` declares ${options.label} ${options.relative}, but the file is missing.`,
    );
  }
  if ((await readFile(path, "utf8")).trim().length === 0) {
    throw new Error(
      `BYOR profile \`${options.profile}\` has an empty ${options.label}: ${options.relative}.`,
    );
  }
}

/** Validate a user-provided macOS BYOR repository without changing the host. */
export async function validateMacosByorSource(options: {
  root: string;
  profile?: string;
}): Promise<ValidatedMacosByorProfile> {
  const root = await resolveByorRoot(options.root);
  const contract = await readByorContract(root);
  if (macosProfileNames(contract).length === 0) {
    throw new Error(`${BYOR_CONTRACT_PATH} does not declare any macOS profiles.`);
  }
  const selected = selectMacosByorProfile(contract, options.profile);
  const flakeDir = join(root, selected.macos.nix.flake);
  const flakePath = join(flakeDir, "flake.nix");
  if (!(await fileExists(flakePath))) {
    throw new Error(
      `BYOR profile \`${selected.name}\` declares Nix flake ${selected.macos.nix.flake}, but flake.nix is missing.`,
    );
  }
  const flakeContent = await readFile(flakePath, "utf8");
  if (flakeContent.trim().length === 0) {
    throw new Error(`BYOR profile \`${selected.name}\` has an empty Nix flake: ${flakePath}.`);
  }
  if (!/\bdarwinConfigurations\s*=/.test(flakeContent)) {
    throw new Error(
      `BYOR profile \`${selected.name}\` has an invalid flake.nix: darwinConfigurations is required.`,
    );
  }

  const darwinRelative = macosDarwinRelativePath(selected.macos.nix);
  const darwinNixPath = join(root, darwinRelative);
  if (!(await fileExists(darwinNixPath))) {
    throw new Error(
      `BYOR profile \`${selected.name}\` declares darwin path ${darwinRelative}, but the file is missing.`,
    );
  }

  if (selected.macos.brewfile !== undefined) {
    await validateOptionalMacosFile({
      root,
      profile: selected.name,
      label: "brewfile",
      relative: selected.macos.brewfile,
    });
  }
  if (selected.macos.fonts !== undefined) {
    await validateOptionalMacosFile({
      root,
      profile: selected.name,
      label: "fonts.manifest",
      relative: selected.macos.fonts.manifest,
    });
  }
  if (selected.macos.paths !== undefined) {
    for (const relative of selected.macos.paths) {
      const path = join(root, relative);
      if (!(await fileExists(path))) {
        throw new Error(
          `BYOR profile \`${selected.name}\` declares path ${relative}, but the file is missing.`,
        );
      }
    }
  }

  return {
    root,
    profile: selected.name,
    contract,
    macos: selected.macos,
    flakePath: flakeDir,
    darwinNixPath,
    systemAttr: selected.macos.nix.attribute,
  };
}

export interface ByorContractPlatforms {
  linux: boolean;
  windows: boolean;
  macos: boolean;
}

/** Detect which platforms a contract declares. */
export function byorContractPlatforms(contract: ByorContract): ByorContractPlatforms {
  return {
    linux: linuxProfileNames(contract).length > 0,
    windows: windowsProfileNames(contract).length > 0,
    macos: macosProfileNames(contract).length > 0,
  };
}
