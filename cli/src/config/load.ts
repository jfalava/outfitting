import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { Option, Schema } from "effect";
import {
  parse as parseToml,
  type TomlTableWithoutBigInt,
  type TomlValueWithoutBigInt,
} from "smol-toml";

import { normalizeGitRepository, validateGitRef } from "@/config/git";
import { autoMachineId } from "@/config/machine-id";
import { configFilePath, stateRoot as resolveStateRoot } from "@/config/paths";
import {
  type ConfiguredSource,
  type LinuxConfig,
  type ManagerConfig,
  type ManagerConfigFile,
  type MacosConfig,
  type WindowsConfig,
} from "@/config/types";
import { envValue } from "@/secrets";
import {
  linuxPathsFromProfile,
  macosPathsFromProfile,
  parseByorContract,
  type ByorContract,
} from "@/source/contract";
import { isReservedSourcePath } from "@/source/reserved";

const LinuxFileSchema = Schema.Struct({
  profile: Schema.optionalKey(Schema.NonEmptyString),
});

const MacosFileSchema = Schema.Struct({
  profile: Schema.optionalKey(Schema.NonEmptyString),
});

const WindowsFileSchema = Schema.Struct({
  profiles: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
  shared: Schema.optionalKey(Schema.MutableJson),
});

const SourceFileSchema = Schema.Struct({
  path: Schema.optionalKey(Schema.NonEmptyString),
  repository: Schema.optionalKey(Schema.NonEmptyString),
  ref: Schema.optionalKey(Schema.NonEmptyString),
});

const ConfigFileSchema = Schema.Struct({
  schema: Schema.Literal(1),
  machine_id: Schema.optionalKey(Schema.NonEmptyString),
  source: Schema.optionalKey(SourceFileSchema),
  linux: Schema.optionalKey(LinuxFileSchema),
  macos: Schema.optionalKey(MacosFileSchema),
  windows: Schema.optionalKey(WindowsFileSchema),
  profiles: Schema.optionalKey(Schema.Record(Schema.String, Schema.MutableJson)),
});

const decodeConfigFile = Schema.decodeUnknownOption(ConfigFileSchema);
const TomlObjectSchema = Schema.Record(Schema.String, Schema.MutableJson);
const decodeTomlObject = Schema.decodeUnknownOption(TomlObjectSchema);

function validateProfile(value: string, platform: string): string {
  const profile = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile)) {
    throw new Error(`config.toml has an invalid ${platform} profile: ${value}.`);
  }
  return profile;
}

/** Resolve the Linux profile block from a config file fragment. */
export function resolveLinuxConfig(file: ManagerConfigFile["linux"] = {}): LinuxConfig | undefined {
  if (file.profile === undefined) {
    return undefined;
  }
  return { profile: validateProfile(file.profile, "Linux") };
}

type DecodedConfig = Schema.Schema.Type<typeof ConfigFileSchema>;
type MutableJson = Schema.Schema.Type<typeof Schema.MutableJson>;
type JsonTable = Record<string, MutableJson>;

function assertTableKeys(
  value: TomlValueWithoutBigInt,
  allowed: ReadonlyArray<string>,
  label: string,
): void {
  const decoded = decodeTomlObject(value);
  if (Option.isNone(decoded)) {
    throw new Error(`${label} must be a TOML table.`);
  }
  const unknown = Object.keys(decoded.value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unsupported key(s): ${unknown.join(", ")}.`);
  }
}

function assertConfigTableKeys(parsed: TomlTableWithoutBigInt, configPath: string): void {
  assertTableKeys(
    parsed,
    ["schema", "machine_id", "source", "linux", "macos", "windows", "profiles"],
    configPath,
  );
  if (parsed.source !== undefined) {
    assertTableKeys(parsed.source, ["path", "repository", "ref"], `${configPath} [source]`);
  }
  if (parsed.linux !== undefined) {
    assertTableKeys(parsed.linux, ["profile"], `${configPath} [linux]`);
  }
  if (parsed.macos !== undefined) {
    assertTableKeys(parsed.macos, ["profile"], `${configPath} [macos]`);
  }
  if (parsed.windows !== undefined) {
    assertTableKeys(parsed.windows, ["profiles", "shared"], `${configPath} [windows]`);
  }
}

function normalizeSource(
  source: DecodedConfig["source"],
  configPath: string,
): ConfiguredSource | undefined {
  if (source === undefined) {
    return undefined;
  }
  const hasPath = source.path !== undefined;
  const hasRepository = source.repository !== undefined;
  if (hasPath === hasRepository || (hasPath && source.ref !== undefined)) {
    throw new Error("config.toml [source] must define either path or repository plus ref.");
  }
  if (hasPath) {
    return { kind: "local", path: resolve(dirname(configPath), source.path!.trim()) };
  }
  if (source.ref === undefined) {
    throw new Error("config.toml [source] remote mode requires both repository and ref.");
  }
  return {
    kind: "remote",
    repository: normalizeGitRepository(source.repository!),
    ref: validateGitRef(source.ref),
  };
}

function profileDeclarationPaths(profile: ByorContract["profiles"][string]): string[] {
  const paths: string[] = [];
  if (profile.linux !== undefined) {
    paths.push(...linuxPathsFromProfile(profile.linux));
  }
  if (profile.macos !== undefined) {
    paths.push(...macosPathsFromProfile(profile.macos));
  }
  if (profile.windows !== undefined) {
    paths.push(profile.windows.winget.manifest);
  }
  return paths;
}

function declarationPaths(contract: ByorContract): string[] {
  const paths = Object.values(contract.profiles).flatMap(profileDeclarationPaths);
  if (contract.windows?.scoop !== undefined) {
    paths.push(contract.windows.scoop.manifest);
  }
  if (contract.windows?.powershell !== undefined) {
    paths.push(contract.windows.powershell.path);
  }
  if (contract.windows?.fonts !== undefined) {
    paths.push(contract.windows.fonts.manifest);
  }
  if (contract.windows?.registry !== undefined) {
    paths.push(contract.windows.registry.path);
  }
  return paths;
}

function normalizeWindowsShared(value: MutableJson | undefined): JsonTable | undefined {
  if (value === undefined) {
    return undefined;
  }
  const decoded = decodeTomlObject(value);
  if (Option.isNone(decoded)) {
    throw new Error("config.toml [windows.shared] must be a table.");
  }
  if ("defaultProfiles" in decoded.value) {
    throw new Error(
      "Use [windows].profiles to select Windows profiles, not windows.shared.defaultProfiles.",
    );
  }
  return decoded.value;
}

function normalizeDeclarations(decoded: DecodedConfig): ByorContract | undefined {
  if (decoded.profiles === undefined) {
    if (decoded.windows?.shared !== undefined) {
      throw new Error("config.toml [windows.shared] requires at least one declared profile.");
    }
    return undefined;
  }
  if (Object.keys(decoded.profiles).length === 0) {
    throw new Error("config.toml [profiles] must contain at least one profile.");
  }
  const rawWindows = decoded.windows?.shared;
  const windows = normalizeWindowsShared(rawWindows);
  try {
    const raw =
      windows === undefined
        ? { schema: 1 as const, profiles: decoded.profiles }
        : { schema: 1 as const, profiles: decoded.profiles, windows };
    const contract = parseByorContract(raw as Parameters<typeof parseByorContract>[0]);
    const reserved = declarationPaths(contract).filter(isReservedSourcePath);
    if (reserved.length > 0) {
      throw new Error(
        `Profile declarations cannot reference reserved root file(s): ${[...new Set(reserved)].join(", ")}.`,
      );
    }
    return contract;
  } catch (cause) {
    throw new Error(
      `config.toml profile declarations are invalid: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

function configFileFromDecoded(decoded: DecodedConfig, configPath: string): ManagerConfigFile {
  const file: ManagerConfigFile = { schema: 1 };
  if (decoded.machine_id !== undefined) {
    file.machineId = decoded.machine_id.trim();
  }
  const source = normalizeSource(decoded.source, configPath);
  if (source !== undefined) {
    file.source = source;
  }
  if (decoded.linux?.profile !== undefined) {
    file.linux = { profile: validateProfile(decoded.linux.profile, "Linux") };
  }
  if (decoded.macos?.profile !== undefined) {
    file.macos = { profile: validateProfile(decoded.macos.profile, "macOS") };
  }
  if (decoded.windows?.profiles !== undefined) {
    const profiles = decoded.windows.profiles.map((profile) => validateProfile(profile, "Windows"));
    if (profiles.length === 0) {
      throw new Error("config.toml [windows].profiles must not be empty when specified.");
    }
    file.windows = { profiles: [...new Set(profiles)] };
  }
  const declarations = normalizeDeclarations(decoded);
  if (declarations !== undefined) {
    file.declarations = declarations;
  }
  return file;
}

function parseConfigFile(raw: string, configPath: string): ManagerConfigFile {
  let parsed: TomlTableWithoutBigInt;
  try {
    parsed = parseToml(raw, { integersAsBigInt: false });
  } catch (cause) {
    throw new Error(`${configPath} is not valid TOML.`, { cause });
  }
  assertConfigTableKeys(parsed, configPath);
  const decoded = decodeConfigFile(parsed);
  if (Option.isNone(decoded)) {
    throw new Error(`${configPath} must use config schema 1 and the supported TOML tables.`);
  }
  return configFileFromDecoded(decoded.value, configPath);
}

function isNotFound(cause: unknown): boolean {
  return (
    cause instanceof Error && "code" in cause && (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readConfigFile(path: string): Promise<ManagerConfigFile | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return parseConfigFile(raw, path);
  } catch (cause) {
    if (isNotFound(cause)) {
      return undefined;
    }
    throw cause;
  }
}

interface ResolvedMachineId {
  machineId: string;
  machineIdOverridden: boolean;
}

function resolveMachineId(file: ManagerConfigFile, override?: string): ResolvedMachineId {
  if (override !== undefined) {
    return { machineId: override, machineIdOverridden: true } satisfies ResolvedMachineId;
  }
  const envMachine = envValue("OUTFITTING_MACHINE_ID");
  if (envMachine !== undefined) {
    return { machineId: envMachine, machineIdOverridden: true } satisfies ResolvedMachineId;
  }
  if (file.machineId !== undefined) {
    return { machineId: file.machineId, machineIdOverridden: true } satisfies ResolvedMachineId;
  }
  return { machineId: autoMachineId(), machineIdOverridden: false } satisfies ResolvedMachineId;
}

/**
 * Load config.toml. Machine-ID precedence is command override → environment → TOML → auto.
 */
export async function loadConfig(options?: {
  stateRoot?: string;
  configPath?: string;
  machineId?: string;
}): Promise<ManagerConfig> {
  const root = options?.stateRoot ?? resolveStateRoot();
  const path = resolve(
    options?.configPath ?? envValue("OUTFITTING_CONFIG") ?? configFilePath(root),
  );
  const file = (await readConfigFile(path)) ?? {};
  const resolved = resolveMachineId(file, options?.machineId);
  return managerConfigFromFile(file, root, path, resolved);
}

function managerConfigFromFile(
  file: ManagerConfigFile,
  root: string,
  path: string,
  machineId: ResolvedMachineId,
): ManagerConfig {
  const config: ManagerConfig = {
    configPath: path,
    stateRoot: root,
    machineId: machineId.machineId,
    machineIdOverridden: machineId.machineIdOverridden,
  };
  const linux = resolveLinuxConfig(file.linux);
  if (file.source !== undefined) {
    config.source = file.source;
  }
  if (linux !== undefined) {
    config.linux = linux;
  }
  if (file.macos !== undefined) {
    config.macos = file.macos as MacosConfig;
  }
  if (file.windows !== undefined) {
    config.windows = file.windows as WindowsConfig;
  }
  if (file.declarations !== undefined) {
    config.declarations = file.declarations;
  }
  return config;
}

/** Create the manager state root. Does not fetch. */
export async function ensureStateRoot(root = resolveStateRoot()): Promise<string> {
  await mkdir(root, { recursive: true });
  return root;
}
