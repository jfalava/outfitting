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
  DEFAULT_WINDOWS_ROUTES,
  type LinuxConfig,
  type ManagerConfig,
  type ManagerConfigFile,
  type ManifestSourceConfig,
  type WindowsRoutesConfig,
} from "@/config/types";
import { envValue } from "@/secrets";

const ManifestFileSchema = Schema.Struct({
  kind: Schema.optionalKey(Schema.Literals(["byor", "raw"])),
  baseUrl: Schema.optionalKey(Schema.NonEmptyString),
  ref: Schema.optionalKey(Schema.NonEmptyString),
});

const WindowsFileSchema = Schema.Struct({
  wingetProfilePath: Schema.optionalKey(Schema.NonEmptyString),
  scoopPath: Schema.optionalKey(Schema.NonEmptyString),
  powershellProfilePath: Schema.optionalKey(Schema.NonEmptyString),
  fontListPath: Schema.optionalKey(Schema.NonEmptyString),
  registryPath: Schema.optionalKey(Schema.NonEmptyString),
  defaultProfiles: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
});

const LinuxFileSchema = Schema.Struct({
  profile: Schema.optionalKey(Schema.NonEmptyString),
});

const ConfigFileSchema = Schema.Struct({
  machineId: Schema.optionalKey(Schema.NonEmptyString),
  manifest: Schema.optionalKey(ManifestFileSchema),
  windows: Schema.optionalKey(WindowsFileSchema),
  linux: Schema.optionalKey(LinuxFileSchema),
});

const decodeConfigFile = Schema.decodeUnknownOption(ConfigFileSchema);

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

const ROUTE_KEYS = [
  "wingetProfilePath",
  "scoopPath",
  "powershellProfilePath",
  "fontListPath",
  "registryPath",
] as const satisfies ReadonlyArray<keyof Omit<WindowsRoutesConfig, "defaultProfiles">>;

function normalizeRoute(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function validateRoute(value: string, key: string): string {
  const route = normalizeRoute(value);
  if (
    route.length === 0 ||
    route.includes("\\") ||
    route.split("/").some((segment) => segment === ".." || segment.length === 0)
  ) {
    throw new Error(`outfitting config.json has an invalid Windows route: ${key}.`);
  }
  return route;
}

function validateProfile(value: string): string {
  const profile = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile)) {
    throw new Error(`outfitting config.json has an invalid Windows profile: ${value}.`);
  }
  return profile;
}

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

export function resolveWindowsRoutes(file: ManagerConfigFile["windows"] = {}): WindowsRoutesConfig {
  const routes = { ...DEFAULT_WINDOWS_ROUTES };
  for (const key of ROUTE_KEYS) {
    const value = file[key];
    if (value !== undefined) {
      routes[key] = validateRoute(value, key);
    }
  }
  if (file.defaultProfiles !== undefined) {
    const profiles = file.defaultProfiles.map(validateProfile);
    if (profiles.length === 0) {
      throw new Error("outfitting config.json must define at least one Windows profile.");
    }
    routes.defaultProfiles = [...new Set(profiles)];
  }
  if (!routes.wingetProfilePath.includes("{profile}")) {
    throw new Error("The Windows wingetProfilePath route must contain {profile}.");
  }
  return routes;
}

type DecodedConfig = Schema.Schema.Type<typeof ConfigFileSchema>;

function normalizeConfigFile(decoded: DecodedConfig): ManagerConfigFile {
  const file: ManagerConfigFile = {};
  if (decoded.machineId !== undefined) {
    file.machineId = decoded.machineId.trim();
  }
  if (decoded.manifest !== undefined) {
    const manifest: Partial<ManifestSourceConfig> = {};
    if (decoded.manifest.kind !== undefined) {
      manifest.kind = decoded.manifest.kind;
    }
    if (decoded.manifest.baseUrl !== undefined) {
      manifest.baseUrl = stripTrailingSlash(decoded.manifest.baseUrl.trim());
    }
    if (decoded.manifest.ref !== undefined) {
      manifest.ref = decoded.manifest.ref.trim();
    }
    file.manifest = manifest;
  }
  if (decoded.windows !== undefined) {
    const windows: Partial<WindowsRoutesConfig> = {};
    for (const key of ROUTE_KEYS) {
      const value = decoded.windows[key];
      if (value !== undefined) {
        windows[key] = validateRoute(value, key);
      }
    }
    if (decoded.windows.defaultProfiles !== undefined) {
      windows.defaultProfiles = decoded.windows.defaultProfiles.map(validateProfile);
    }
    file.windows = windows;
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
      "outfitting config.json must be an object with optional machineId, manifest.{baseUrl,ref}, windows route fields, and linux.profile.",
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

function resolveManifest(file: ManagerConfigFile): ManifestSourceConfig {
  const baseUrl =
    envValue("OUTFITTING_MANIFEST_BASE_URL") ?? file.manifest?.baseUrl ?? DEFAULT_MANIFEST_BASE_URL;
  const ref = envValue("OUTFITTING_MANIFEST_REF") ?? file.manifest?.ref ?? DEFAULT_MANIFEST_REF;
  const manifest: ManifestSourceConfig = {
    baseUrl: stripTrailingSlash(baseUrl),
    ref,
  };
  if (file.manifest?.kind !== undefined) {
    manifest.kind = file.manifest.kind;
  }
  return manifest;
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

  const linux = resolveLinuxConfig(file.linux);
  const config: ManagerConfig = {
    stateRoot: root,
    machineId: resolved.machineId,
    machineIdOverridden: resolved.machineIdOverridden,
    manifest: resolveManifest(file),
    windows: resolveWindowsRoutes(file.windows),
  };
  if (linux !== undefined) {
    config.linux = linux;
  }
  return config;
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
  const manifest: Partial<ManifestSourceConfig> = { ...existing.manifest };
  if (patch.manifest?.kind !== undefined) {
    manifest.kind = patch.manifest.kind;
  }
  if (patch.manifest?.baseUrl !== undefined) {
    manifest.baseUrl = patch.manifest.baseUrl;
  }
  if (patch.manifest?.ref !== undefined) {
    manifest.ref = patch.manifest.ref;
  }
  return Object.keys(manifest).length === 0 ? undefined : manifest;
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
  const windowsPatch = patch.windows;
  const windowsExisting = existing.windows;
  if (windowsPatch !== undefined || windowsExisting !== undefined) {
    const windows: Partial<WindowsRoutesConfig> = {
      ...windowsExisting,
      ...windowsPatch,
    };
    next.windows = windows;
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
  if (next.windows !== undefined) {
    resolveWindowsRoutes(next.windows);
  }
  if (next.linux !== undefined) {
    resolveLinuxConfig(next.linux);
  }
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialized, "utf8");
  return path;
}
