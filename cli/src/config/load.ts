import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Option, Schema } from "effect";

import { autoMachineId } from "@/config/machine-id";
import {
  configFilePath,
  manifestCacheDir,
  manifestsDir,
  stateRoot as resolveStateRoot,
} from "@/config/paths";
import {
  DEFAULT_MANIFEST_BASE_URL,
  DEFAULT_MANIFEST_REF,
  type ManagerConfig,
  type ManagerConfigFile,
  type ManifestSourceConfig,
} from "@/config/types";
import { envValue } from "@/secrets";

const ManifestFileSchema = Schema.Struct({
  baseUrl: Schema.optionalKey(Schema.NonEmptyString),
  ref: Schema.optionalKey(Schema.NonEmptyString),
});

const ConfigFileSchema = Schema.Struct({
  machineId: Schema.optionalKey(Schema.NonEmptyString),
  manifest: Schema.optionalKey(ManifestFileSchema),
});

const decodeConfigFile = Schema.decodeUnknownOption(ConfigFileSchema);

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

type DecodedConfig = Schema.Schema.Type<typeof ConfigFileSchema>;

function normalizeConfigFile(decoded: DecodedConfig): ManagerConfigFile {
  const file: ManagerConfigFile = {};
  if (decoded.machineId !== undefined) {
    file.machineId = decoded.machineId.trim();
  }
  if (decoded.manifest !== undefined) {
    const manifest: Partial<ManifestSourceConfig> = {};
    if (decoded.manifest.baseUrl !== undefined) {
      manifest.baseUrl = stripTrailingSlash(decoded.manifest.baseUrl.trim());
    }
    if (decoded.manifest.ref !== undefined) {
      manifest.ref = decoded.manifest.ref.trim();
    }
    file.manifest = manifest;
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
      "outfitting config.json must be an object with optional machineId and manifest.{baseUrl,ref} strings.",
    );
  }
  return normalizeConfigFile(decoded.value);
}

function isNotFound(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    "code" in cause &&
    (cause as NodeJS.ErrnoException).code === "ENOENT"
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

function resolveManifest(file: ManagerConfigFile): ManifestSourceConfig {
  const baseUrl =
    envValue("OUTFITTING_MANIFEST_BASE_URL") ??
    file.manifest?.baseUrl ??
    DEFAULT_MANIFEST_BASE_URL;
  const ref =
    envValue("OUTFITTING_MANIFEST_REF") ?? file.manifest?.ref ?? DEFAULT_MANIFEST_REF;
  return {
    baseUrl: stripTrailingSlash(baseUrl),
    ref,
  };
}

/**
 * Load effective manager config.
 * Precedence for machine id: `OUTFITTING_MACHINE_ID` → config.json → auto.
 * Precedence for manifest: env → config.json → defaults.
 */
export async function loadConfig(options?: {
  stateRoot?: string;
  configPath?: string;
}): Promise<ManagerConfig> {
  const root = options?.stateRoot ?? resolveStateRoot();
  const path = options?.configPath ?? configFilePath(root);
  const file = (await readConfigFile(path)) ?? {};
  const resolved = resolveMachineId(file);

  return {
    stateRoot: root,
    machineId: resolved.machineId,
    machineIdOverridden: resolved.machineIdOverridden,
    manifest: resolveManifest(file),
  };
}

/** Create state root layout (config parent, cache, manifests). Does not fetch. */
export async function ensureStateRoot(root = resolveStateRoot()): Promise<string> {
  await mkdir(root, { recursive: true });
  await mkdir(manifestCacheDir(root), { recursive: true });
  await mkdir(manifestsDir(root), { recursive: true });
  return root;
}

function pickManifest(
  patch: ManagerConfigFile,
  existing: ManagerConfigFile,
): Partial<ManifestSourceConfig> | undefined {
  const baseUrl = patch.manifest?.baseUrl ?? existing.manifest?.baseUrl;
  const ref = patch.manifest?.ref ?? existing.manifest?.ref;
  if (baseUrl === undefined && ref === undefined) {
    return undefined;
  }
  const manifest: Partial<ManifestSourceConfig> = {};
  if (baseUrl !== undefined) {
    manifest.baseUrl = baseUrl;
  }
  if (ref !== undefined) {
    manifest.ref = ref;
  }
  return manifest;
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
  const manifest = pickManifest(patch, existing);
  if (manifest !== undefined) {
    next.manifest = manifest;
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
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialized, "utf8");
  return path;
}
