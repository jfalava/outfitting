import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Option, Schema } from "effect";

import { autoMachineId } from "@/config/machine-id";
import { configFilePath, stateRoot as resolveStateRoot } from "@/config/paths";
import { type LinuxConfig, type ManagerConfig, type ManagerConfigFile } from "@/config/types";
import { envValue } from "@/secrets";

const LinuxFileSchema = Schema.Struct({
  profile: Schema.optionalKey(Schema.NonEmptyString),
});

const ConfigFileSchema = Schema.Struct({
  machineId: Schema.optionalKey(Schema.NonEmptyString),
  linux: Schema.optionalKey(LinuxFileSchema),
});

const decodeConfigFile = Schema.decodeUnknownOption(ConfigFileSchema);

function validateLinuxProfile(value: string): string {
  const profile = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile)) {
    throw new Error(`outfitting config.json has an invalid Linux profile: ${value}.`);
  }
  return profile;
}

/** Resolve the Linux profile block from a config file fragment. */
export function resolveLinuxConfig(file: ManagerConfigFile["linux"] = {}): LinuxConfig | undefined {
  if (file.profile === undefined) {
    return undefined;
  }
  return { profile: validateLinuxProfile(file.profile) };
}

type DecodedConfig = Schema.Schema.Type<typeof ConfigFileSchema>;

function normalizeConfigFile(decoded: DecodedConfig): ManagerConfigFile {
  const file: ManagerConfigFile = {};
  if (decoded.machineId !== undefined) {
    file.machineId = decoded.machineId.trim();
  }
  if (decoded.linux !== undefined) {
    const linux: Partial<LinuxConfig> = {};
    if (decoded.linux.profile !== undefined) {
      linux.profile = validateLinuxProfile(decoded.linux.profile);
    }
    file.linux = linux;
  }
  return file;
}

function parseConfigFile(raw: string): ManagerConfigFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("outfitting config.json is not valid JSON.");
  }
  const decoded = decodeConfigFile(parsed);
  if (Option.isNone(decoded)) {
    throw new Error(
      "outfitting config.json must be an object with optional machineId and linux.profile.",
    );
  }
  return normalizeConfigFile(decoded.value);
}

function isNotFound(cause: unknown): boolean {
  return (
    cause instanceof Error && "code" in cause && (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readConfigFile(path: string): Promise<ManagerConfigFile | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return parseConfigFile(raw);
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

function resolveMachineId(file: ManagerConfigFile): ResolvedMachineId {
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
 * Load effective manager config.
 * Precedence for machine id: `OUTFITTING_MACHINE_ID` → config.json → auto.
 */
export async function loadConfig(options?: {
  stateRoot?: string;
  configPath?: string;
}): Promise<ManagerConfig> {
  const root = options?.stateRoot ?? resolveStateRoot();
  const path = options?.configPath ?? configFilePath(root);
  const file = (await readConfigFile(path)) ?? {};
  const resolved = resolveMachineId(file);

  const linux = resolveLinuxConfig(file.linux);
  const config: ManagerConfig = {
    stateRoot: root,
    machineId: resolved.machineId,
    machineIdOverridden: resolved.machineIdOverridden,
  };
  if (linux !== undefined) {
    config.linux = linux;
  }
  return config;
}

/** Create the manager state root. Does not fetch. */
export async function ensureStateRoot(root = resolveStateRoot()): Promise<string> {
  await mkdir(root, { recursive: true });
  return root;
}

function mergeConfigFiles(
  existing: ManagerConfigFile,
  patch: ManagerConfigFile,
): ManagerConfigFile {
  const next: ManagerConfigFile = {};
  const machineId = patch.machineId ?? existing.machineId;
  if (machineId !== undefined) {
    next.machineId = machineId;
  }
  const linuxPatch = patch.linux;
  const linuxExisting = existing.linux;
  if (linuxPatch !== undefined || linuxExisting !== undefined) {
    const linux: Partial<LinuxConfig> = {
      ...linuxExisting,
      ...linuxPatch,
    };
    next.linux = linux;
  }
  return next;
}

/** Write config.json (creates parent dirs). Merges with existing file when present. */
export async function saveConfigFile(
  patch: ManagerConfigFile,
  options?: { stateRoot?: string; configPath?: string },
): Promise<string> {
  const root = options?.stateRoot ?? resolveStateRoot();
  const path = options?.configPath ?? configFilePath(root);
  await ensureStateRoot(root);

  const existing = (await readConfigFile(path)) ?? {};
  const next = mergeConfigFiles(existing, patch);
  if (next.linux !== undefined) {
    resolveLinuxConfig(next.linux);
  }
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialized, "utf8");
  return path;
}
