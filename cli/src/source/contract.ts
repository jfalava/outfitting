import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { Result, Schema } from "effect";

import { parseLinuxPackageManifest } from "@/source/linux-manifest";
import { isLinuxProfile, type LinuxProfile } from "@/source/linux-profile";

export const BYOR_CONTRACT_PATH = "outfitting.json";
export const BYOR_CONTRACT_SCHEMA = 1;

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
}

export interface ByorProfileDeclaration {
  linux: LinuxProfileDeclaration;
}

export interface ByorContract {
  schema: typeof BYOR_CONTRACT_SCHEMA;
  profiles: Readonly<Record<string, ByorProfileDeclaration>>;
}

export interface SelectedByorProfile {
  name: LinuxProfile;
  linux: LinuxProfileDeclaration;
}

export interface ValidatedLinuxByorProfile {
  root: string;
  profile: LinuxProfile;
  contract: ByorContract;
  linux: LinuxProfileDeclaration;
  backends: ReadonlyArray<LinuxPackageBackend | "nix">;
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
});

const ByorProfileSchema = Schema.Struct({ linux: LinuxProfileSchema });

const ByorContractSchema = Schema.Struct({
  schema: Schema.Literal(BYOR_CONTRACT_SCHEMA),
  profiles: Schema.Record(Schema.String, ByorProfileSchema),
});

type DecodedPackageDeclaration = Schema.Schema.Type<typeof PackageDeclarationSchema>;
type DecodedNixDeclaration = Schema.Schema.Type<typeof NixDeclarationSchema>;
type DecodedLinuxProfile = Schema.Schema.Type<typeof LinuxProfileSchema>;
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

function parseNixDeclaration(value: DecodedNixDeclaration, label: string): LinuxNixDeclaration {
  const attribute = requiredString(value.attribute, `${label}.attribute`);
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(attribute)) {
    throw new Error(`${label}.attribute must be a dot-separated Nix attribute path.`);
  }
  return {
    flake: relativeSourcePath(value.flake, `${label}.flake`),
    attribute,
  };
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
  if (Object.keys(linux).length === 0) {
    throw new Error(`${label} must declare apt, pacman, or nix.`);
  }
  return linux;
}

/** Parse and validate the repository-owned BYOR contract. */
export function parseByorContract(value: JsonValue): ByorContract {
  const decoded = decodeByorContract(value);
  if (Result.isFailure(decoded)) {
    const detail = decoded.failure.message.trim();
    throw new Error(
      detail.length > 0
        ? `${BYOR_CONTRACT_PATH} is invalid:\n${detail}`
        : `${BYOR_CONTRACT_PATH} must match schema ${BYOR_CONTRACT_SCHEMA}.`,
    );
  }
  const contract: DecodedContract = decoded.success;
  if (Object.keys(contract.profiles).length === 0) {
    throw new Error(`${BYOR_CONTRACT_PATH}.profiles must contain at least one profile.`);
  }

  const profiles: Record<string, ByorProfileDeclaration> = {};
  for (const [rawName, valueForProfile] of Object.entries(contract.profiles)) {
    const name = profileName(rawName, `${BYOR_CONTRACT_PATH}.profiles profile name`);
    profiles[name] = { linux: parseLinuxProfile(valueForProfile.linux, `${name}.linux`) };
  }
  return { schema: BYOR_CONTRACT_SCHEMA, profiles };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Select a profile from a parsed contract.
 * Shared by validation and flake resolution so messages and defaults stay identical.
 */
export function selectByorProfile(
  contract: ByorContract,
  requested: string | undefined,
): SelectedByorProfile {
  if (requested !== undefined) {
    const name = profileName(requested, "--profile");
    const profile = contract.profiles[name];
    if (profile === undefined) {
      throw new Error(
        `Unknown BYOR profile \`${name}\`. Choose: ${Object.keys(contract.profiles).join(", ")}.`,
      );
    }
    return { name, linux: profile.linux };
  }

  const names = Object.keys(contract.profiles);
  if (names.length !== 1) {
    throw new Error(
      `The BYOR repository defines multiple profiles. Pass --profile (${names.join(", ")}).`,
    );
  }
  const name = profileName(names[0]!, `${BYOR_CONTRACT_PATH}.profiles profile name`);
  const profile = contract.profiles[name];
  if (profile === undefined) {
    throw new Error(`Unknown BYOR profile \`${name}\`.`);
  }
  return { name, linux: profile.linux };
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

/** Validate a user-provided Linux BYOR repository without changing the host. */
export async function validateLinuxByorSource(options: {
  root: string;
  profile?: string;
}): Promise<ValidatedLinuxByorProfile> {
  let root: string;
  try {
    root = await realpath(options.root);
  } catch (cause) {
    throw new Error(`BYOR repository does not exist: ${options.root}.`, { cause });
  }
  try {
    if (!(await stat(root)).isDirectory()) {
      throw new Error("not a directory");
    }
  } catch (cause) {
    throw new Error(`BYOR repository is not a directory: ${root}.`, { cause });
  }

  const contract = await readByorContract(root);
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
