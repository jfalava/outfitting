import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Option, Schema } from "effect";
import { stringify as stringifyToml } from "smol-toml";

import { configFilePath, sparseSourceRoot, stateRoot as resolveStateRoot } from "@/config/paths";
import { publishValidatedConfig } from "@/config/write";
import { envValue } from "@/secrets";
import { readByorMap } from "@/source/byor-map";
import {
  readLegacyByorContract,
  selectByorProfile,
  validateLinuxByorSource,
  validateMacosByorSource,
  validateWindowsByorSource,
  type ByorContract,
  type ByorProfileDeclaration,
  type ByorWindowsShared,
} from "@/source/contract";

interface LegacyManagerConfig {
  machineId?: string;
  linuxProfile?: string;
}

interface SplitWindowsSelection {
  declarations: ByorContract;
  windowsProfiles?: string[];
}

interface ResolvedLegacySource {
  kind: "local" | "remote";
  source: { path: string } | { repository: string; ref: string };
  contract: ByorContract;
}

interface MigratedToml {
  schema: 1;
  source: ResolvedLegacySource["source"];
  machine_id?: string;
  linux?: { profile: string };
  macos?: { profile: string };
  windows?: { profiles?: string[]; shared?: ByorWindowsShared };
  profiles: Readonly<Record<string, ByorProfileDeclaration>>;
}

const LegacyJsonTableSchema = Schema.Record(Schema.String, Schema.MutableJson);
const decodeLegacyJsonTable = Schema.decodeUnknownOption(LegacyJsonTableSchema);
const decodeLegacyString = Schema.decodeUnknownOption(Schema.NonEmptyString);

function isNotFound(cause: unknown): boolean {
  return (
    cause instanceof Error && "code" in cause && (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function legacyString(
  value: Schema.Schema.Type<typeof Schema.MutableJson> | undefined,
  label: string,
) {
  if (value === undefined) {
    return undefined;
  }
  const decoded = decodeLegacyString(value);
  if (Option.isNone(decoded) || decoded.value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return decoded.value.trim();
}

async function readLegacyManagerConfig(path: string): Promise<LegacyManagerConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (cause) {
    if (isNotFound(cause)) {
      return {};
    }
    throw cause;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`${path} is not valid legacy JSON.`, { cause });
  }
  const decodedInput = decodeLegacyJsonTable(parsed);
  if (Option.isNone(decodedInput)) {
    throw new Error(`${path} must contain a JSON object.`);
  }
  const input = decodedInput.value;
  const unsupported = Object.keys(input).filter((key) => !["machineId", "linux"].includes(key));
  if (unsupported.length > 0) {
    throw new Error(
      `${path} contains legacy keys that cannot be migrated automatically: ${unsupported.join(", ")}.`,
    );
  }

  const result: LegacyManagerConfig = {};
  const machineId = legacyString(input.machineId, `${path} machineId`);
  if (machineId !== undefined) {
    result.machineId = machineId;
  }
  if (input.linux !== undefined) {
    const decodedLinux = decodeLegacyJsonTable(input.linux);
    if (Option.isNone(decodedLinux)) {
      throw new Error(`${path} linux must be an object.`);
    }
    const linux = decodedLinux.value;
    if (Object.keys(linux).some((key) => key !== "profile")) {
      throw new Error(`${path} linux contains unsupported legacy keys.`);
    }
    const profile = legacyString(linux.profile, `${path} linux.profile`);
    if (profile !== undefined) {
      result.linuxProfile = profile;
    }
  }
  return result;
}

function splitWindowsSelection(contract: ByorContract): SplitWindowsSelection {
  const windowsProfiles = contract.windows?.defaultProfiles;
  if (contract.windows === undefined) {
    return { declarations: contract };
  }
  const { defaultProfiles: _defaultProfiles, ...shared } = contract.windows;
  const declarations: ByorContract = { schema: 1, profiles: contract.profiles };
  if (Object.keys(shared).length > 0) {
    declarations.windows = shared;
  }
  const result: SplitWindowsSelection = { declarations };
  if (windowsProfiles !== undefined) {
    result.windowsProfiles = windowsProfiles;
  }
  return result;
}

async function validateLocalContract(root: string, contract: ByorContract): Promise<void> {
  for (const [name, declaration] of Object.entries(contract.profiles)) {
    if (declaration.linux !== undefined) {
      await validateLinuxByorSource({ root, profile: name, contract });
    }
    if (declaration.macos !== undefined) {
      await validateMacosByorSource({ root, profile: name, contract });
    }
  }
  if (Object.values(contract.profiles).some((profile) => profile.windows !== undefined)) {
    await validateWindowsByorSource({ root, contract });
  }
}

async function readLegacyRepoPath(root: string): Promise<string | undefined> {
  try {
    return (await readFile(join(root, "repo-path"), "utf8")).trim() || undefined;
  } catch (cause) {
    if (isNotFound(cause)) {
      return undefined;
    }
    throw cause;
  }
}

async function resolveLegacySource(
  root: string,
  options: { repo?: string },
): Promise<ResolvedLegacySource> {
  const [legacyMap, savedRepo] = await Promise.all([readByorMap(root), readLegacyRepoPath(root)]);
  const localRepo = options.repo?.trim() || savedRepo;
  if (legacyMap !== undefined) {
    const cachePath = resolve(sparseSourceRoot(root));
    if (options.repo !== undefined && resolve(options.repo) !== cachePath) {
      throw new Error(
        "Both a remote byor.json and --repo were provided; choose one source to migrate.",
      );
    }
    if (savedRepo !== undefined && resolve(savedRepo) !== cachePath) {
      throw new Error(
        `Both byor.json and repo-path select different sources (${legacyMap.repository} and ${savedRepo}); resolve the conflict before migrating.`,
      );
    }
    return {
      kind: "remote",
      source: { repository: legacyMap.repository, ref: legacyMap.ref },
      contract: legacyMap,
    };
  }

  if (localRepo === undefined) {
    throw new Error(
      "No legacy source was found. Pass --repo <checkout> or create config.toml manually.",
    );
  }
  const localRoot = resolve(localRepo);
  const contract = await readLegacyByorContract(localRoot);
  await validateLocalContract(localRoot, contract);
  return { kind: "local", source: { path: localRoot }, contract };
}

function migratedToml(state: LegacyManagerConfig, source: ResolvedLegacySource): MigratedToml {
  const split = splitWindowsSelection(source.contract);
  let linuxProfile = state.linuxProfile;
  if (linuxProfile !== undefined) {
    selectByorProfile(split.declarations, linuxProfile);
  } else {
    const linuxProfiles = Object.entries(split.declarations.profiles)
      .filter(([, declaration]) => declaration.linux !== undefined)
      .map(([name]) => name);
    if (linuxProfiles.length === 1) {
      linuxProfile = linuxProfiles[0];
    }
  }
  const macosProfiles = Object.entries(split.declarations.profiles)
    .filter(([, declaration]) => declaration.macos !== undefined)
    .map(([name]) => name);

  const toml: MigratedToml = {
    schema: 1,
    source: source.source,
    profiles: split.declarations.profiles,
  };
  if (state.machineId !== undefined) {
    toml.machine_id = state.machineId;
  }
  if (linuxProfile !== undefined) {
    toml.linux = { profile: linuxProfile };
  }
  if (macosProfiles.length === 1) {
    toml.macos = { profile: macosProfiles[0]! };
  }
  if (split.windowsProfiles !== undefined || split.declarations.windows !== undefined) {
    toml.windows = {};
    if (split.windowsProfiles !== undefined) {
      toml.windows.profiles = split.windowsProfiles;
    }
    if (split.declarations.windows !== undefined) {
      toml.windows.shared = split.declarations.windows;
    }
  }
  return toml;
}

/** Convert legacy machine/source configuration to a new TOML file without changing legacy files. */
export async function migrateLegacyConfig(
  options: {
    stateRoot?: string;
    configPath?: string;
    repo?: string;
  } = {},
): Promise<{ configPath: string; source: "local" | "remote" }> {
  const root = options.stateRoot ?? resolveStateRoot();
  const target = resolve(
    options.configPath ?? envValue("OUTFITTING_CONFIG") ?? configFilePath(root),
  );
  const legacyConfig = await readLegacyManagerConfig(join(root, "config.json"));
  const source = await resolveLegacySource(root, options);
  const serialized = stringifyToml(migratedToml(legacyConfig, source));
  await publishValidatedConfig(root, target, serialized);
  return { configPath: target, source: source.kind };
}
