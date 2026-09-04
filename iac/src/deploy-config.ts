import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { Schema } from "effect";

import { jsonObject, jsonString, type JsonObject, type JsonValue } from "./json";

type RuntimeGlobals = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
    cwd?: () => string;
  };
};

// SAFETY: RuntimeGlobals only adds optional members; assertion cannot misstate existing globals.
const hostProcess = (globalThis as RuntimeGlobals).process;

function envMap(): Record<string, string | undefined> {
  return hostProcess?.env ?? {};
}

function cwd(): string {
  return hostProcess?.cwd?.() ?? ".";
}

export type DeployWorkers = {
  readonly router: string;
  readonly api: string;
  readonly docs: string;
  readonly docsAssets: string;
  readonly installer: string;
};

export type DeployConfig = {
  readonly stackName: string;
  readonly kvTitle: string;
  readonly databaseName: string;
  readonly privateFontsBucket: string;
  readonly workers: DeployWorkers;
  readonly domain: string | undefined;
  readonly installerHosts: readonly string[];
  readonly docs: boolean;
  readonly configPath: string | undefined;
};

export type DeployConfigEnv = {
  readonly OUTFITTING_STACK_NAME: string;
  readonly OUTFITTING_KV_TITLE: string;
  readonly OUTFITTING_DB_NAME: string;
  readonly OUTFITTING_PRIVATE_FONTS_BUCKET: string;
  readonly OUTFITTING_ROUTER_NAME: string;
  readonly OUTFITTING_API_NAME: string;
  readonly OUTFITTING_DOCS_NAME: string;
  readonly OUTFITTING_DOCS_ASSETS_NAME: string;
  readonly OUTFITTING_INSTALLER_NAME: string;
  readonly OUTFITTING_DEPLOY_DOCS: string;
  readonly OUTFITTING_DOMAIN: string;
  readonly OUTFITTING_INSTALLER_HOSTS: string;
};

export const DEFAULT_INSTALLER_HOSTS = [
  "win.jfa.dev",
  "wsl.jfa.dev",
  "mac.jfa.dev",
  "nixos.jfa.dev",
] as const;

export const DEFAULT_DEPLOY_CONFIG: Omit<DeployConfig, "configPath"> = {
  stackName: "Outfitting",
  kvTitle: "outfitting-lockfiles",
  databaseName: "outfitting-lockfiles",
  privateFontsBucket: "outfitting-private-fonts",
  workers: {
    router: "outfitting-router",
    api: "outfitting-api",
    docs: "outfitting-docs",
    docsAssets: "outfitting-docs-assets",
    installer: "outfitting-installer",
  },
  domain: "outfitting.jfa.dev",
  installerHosts: [...DEFAULT_INSTALLER_HOSTS],
  docs: true,
};

export type DeployOverrides = Partial<{
  domain: string | undefined;
  docs: boolean;
  stackName: string;
  kvTitle: string;
  databaseName: string;
  privateFontsBucket: string;
  installerHosts: readonly string[];
  workers: Partial<DeployWorkers>;
}>;

function optionalNonEmpty(candidate: JsonObject, field: string): string | undefined {
  if (!(field in candidate)) {
    return undefined;
  }
  const parsed = jsonString(candidate[field]);
  if (parsed === undefined) {
    throw new Error(`${field} must be a string.`);
  }
  const trimmed = parsed.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function optionalBoolean(candidate: JsonObject, field: string): boolean | undefined {
  if (!(field in candidate)) {
    return undefined;
  }
  try {
    return Schema.decodeUnknownSync(Schema.Boolean)(candidate[field]);
  } catch {
    throw new Error(`${field} must be a boolean.`);
  }
}

function optionalStringArray(candidate: JsonObject, field: string): string[] | undefined {
  if (!(field in candidate)) {
    return undefined;
  }
  const value = candidate[field];
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings.`);
  }
  const hosts: string[] = [];
  for (const entry of value) {
    const parsed = jsonString(entry);
    if (parsed === undefined) {
      throw new Error(`${field} must be an array of strings.`);
    }
    const trimmed = parsed.trim();
    if (trimmed.length > 0) {
      hosts.push(trimmed);
    }
  }
  return hosts;
}

function parseDeployFile(raw: string, path: string): Partial<DeployConfig> {
  let root: JsonValue;
  try {
    root = Schema.decodeUnknownSync(Schema.Json)(JSON.parse(raw));
  } catch (cause) {
    throw new Error(
      `Could not parse deploy config at ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  const file = jsonObject(root);
  if (file === undefined) {
    throw new Error(`Deploy config at ${path} must be a JSON object.`);
  }
  const workersObject = jsonObject(file.workers) ?? {};
  return {
    domain: optionalNonEmpty(file, "domain"),
    docs: optionalBoolean(file, "docs"),
    stackName: optionalNonEmpty(file, "stackName"),
    kvTitle: optionalNonEmpty(file, "kv") ?? optionalNonEmpty(file, "kvTitle"),
    databaseName: optionalNonEmpty(file, "database"),
    privateFontsBucket:
      optionalNonEmpty(file, "privateFonts") ?? optionalNonEmpty(file, "privateFontsBucket"),
    installerHosts: optionalStringArray(file, "installerHosts"),
    workers: {
      router: optionalNonEmpty(workersObject, "router") ?? DEFAULT_DEPLOY_CONFIG.workers.router,
      api: optionalNonEmpty(workersObject, "api") ?? DEFAULT_DEPLOY_CONFIG.workers.api,
      docs: optionalNonEmpty(workersObject, "docs") ?? DEFAULT_DEPLOY_CONFIG.workers.docs,
      docsAssets:
        optionalNonEmpty(workersObject, "docsAssets") ?? DEFAULT_DEPLOY_CONFIG.workers.docsAssets,
      installer:
        optionalNonEmpty(workersObject, "installer") ?? DEFAULT_DEPLOY_CONFIG.workers.installer,
    },
  };
}

function envTruthy(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(`OUTFITTING_DEPLOY_DOCS must be a boolean-like value, got '${value}'.`);
}

function parseInstallerHostsEnv(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return trimmed
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

function resolveConfigPath(path: string): string {
  return isAbsolute(path) ? path : resolve(cwd(), path);
}

function discoverConfigPath(explicit: string | undefined): string | undefined {
  if (explicit) {
    return resolveConfigPath(explicit);
  }
  const envPath = envMap()["OUTFITTING_DEPLOY_CONFIG"]?.trim();
  if (envPath) {
    return resolveConfigPath(envPath);
  }
  const cwdFile = join(cwd(), "outfitting.deploy.json");
  if (existsSync(cwdFile)) {
    return cwdFile;
  }
  if (existsSync(join(cwd(), "alchemy.run.ts"))) {
    const sibling = join(cwd(), "outfitting.deploy.json");
    if (existsSync(sibling)) {
      return sibling;
    }
  }
  return undefined;
}

function pickString(
  override: string | undefined,
  envKey: string,
  fromFile: string | undefined,
  fallback: string,
): string {
  return override ?? envMap()[envKey]?.trim() ?? fromFile ?? fallback;
}

function resolveDomain(
  overrides: DeployOverrides | undefined,
  fromFile: Partial<DeployConfig> | undefined,
): string | undefined {
  if (overrides && "domain" in overrides) {
    const value = overrides.domain;
    if (value === undefined) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  const fromEnv = envMap()["OUTFITTING_DOMAIN"];
  if (fromEnv !== undefined) {
    const trimmed = fromEnv.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return fromFile?.domain ?? DEFAULT_DEPLOY_CONFIG.domain;
}

function resolveDocs(
  overrides: DeployOverrides | undefined,
  fromFile: Partial<DeployConfig> | undefined,
): boolean {
  return (
    overrides?.docs ??
    envTruthy(envMap()["OUTFITTING_DEPLOY_DOCS"]) ??
    fromFile?.docs ??
    DEFAULT_DEPLOY_CONFIG.docs
  );
}

function resolveInstallerHosts(
  overrides: DeployOverrides | undefined,
  fromFile: Partial<DeployConfig> | undefined,
): readonly string[] {
  if (overrides?.installerHosts !== undefined) {
    return [...overrides.installerHosts];
  }
  const fromEnv = parseInstallerHostsEnv(envMap()["OUTFITTING_INSTALLER_HOSTS"]);
  if (fromEnv !== undefined) {
    return fromEnv;
  }
  if (fromFile?.installerHosts !== undefined) {
    return fromFile.installerHosts;
  }
  return DEFAULT_DEPLOY_CONFIG.installerHosts;
}

// oxlint-disable-next-line complexity -- one pickString per worker field
function resolveWorkers(
  overrides: DeployOverrides | undefined,
  fromFile: Partial<DeployConfig> | undefined,
): DeployWorkers {
  const fileWorkers = fromFile?.workers;
  const overrideWorkers = overrides?.workers;
  return {
    router: pickString(
      overrideWorkers?.router,
      "OUTFITTING_ROUTER_NAME",
      fileWorkers?.router,
      DEFAULT_DEPLOY_CONFIG.workers.router,
    ),
    api: pickString(
      overrideWorkers?.api,
      "OUTFITTING_API_NAME",
      fileWorkers?.api,
      DEFAULT_DEPLOY_CONFIG.workers.api,
    ),
    docs: pickString(
      overrideWorkers?.docs,
      "OUTFITTING_DOCS_NAME",
      fileWorkers?.docs,
      DEFAULT_DEPLOY_CONFIG.workers.docs,
    ),
    docsAssets: pickString(
      overrideWorkers?.docsAssets,
      "OUTFITTING_DOCS_ASSETS_NAME",
      fileWorkers?.docsAssets,
      DEFAULT_DEPLOY_CONFIG.workers.docsAssets,
    ),
    installer: pickString(
      overrideWorkers?.installer,
      "OUTFITTING_INSTALLER_NAME",
      fileWorkers?.installer,
      DEFAULT_DEPLOY_CONFIG.workers.installer,
    ),
  };
}

/**
 * Resolve deploy naming, domain, installer hosts, and docs toggle.
 * Precedence: overrides → env → config file → defaults.
 */
// Config merge is intentionally branchy (override/env/file/default per field).
// oxlint-disable-next-line complexity -- field-wise precedence matrix
export function loadDeployConfig(options?: {
  readonly configPath?: string;
  readonly overrides?: DeployOverrides;
}): DeployConfig {
  const configPath = discoverConfigPath(options?.configPath);
  const fromFile =
    configPath === undefined || !existsSync(configPath)
      ? undefined
      : parseDeployFile(readFileSync(configPath, "utf8"), configPath);
  const overrides = options?.overrides;

  return {
    stackName: pickString(
      overrides?.stackName,
      "OUTFITTING_STACK_NAME",
      fromFile?.stackName,
      DEFAULT_DEPLOY_CONFIG.stackName,
    ),
    kvTitle: pickString(
      overrides?.kvTitle,
      "OUTFITTING_KV_TITLE",
      fromFile?.kvTitle,
      DEFAULT_DEPLOY_CONFIG.kvTitle,
    ),
    databaseName: pickString(
      overrides?.databaseName,
      "OUTFITTING_DB_NAME",
      fromFile?.databaseName,
      DEFAULT_DEPLOY_CONFIG.databaseName,
    ),
    privateFontsBucket: pickString(
      overrides?.privateFontsBucket,
      "OUTFITTING_PRIVATE_FONTS_BUCKET",
      fromFile?.privateFontsBucket,
      DEFAULT_DEPLOY_CONFIG.privateFontsBucket,
    ),
    workers: resolveWorkers(overrides, fromFile),
    domain: resolveDomain(overrides, fromFile),
    installerHosts: resolveInstallerHosts(overrides, fromFile),
    docs: resolveDocs(overrides, fromFile),
    configPath,
  };
}

export function deployConfigToEnv(config: DeployConfig): DeployConfigEnv {
  return {
    OUTFITTING_STACK_NAME: config.stackName,
    OUTFITTING_KV_TITLE: config.kvTitle,
    OUTFITTING_DB_NAME: config.databaseName,
    OUTFITTING_PRIVATE_FONTS_BUCKET: config.privateFontsBucket,
    OUTFITTING_ROUTER_NAME: config.workers.router,
    OUTFITTING_API_NAME: config.workers.api,
    OUTFITTING_DOCS_NAME: config.workers.docs,
    OUTFITTING_DOCS_ASSETS_NAME: config.workers.docsAssets,
    OUTFITTING_INSTALLER_NAME: config.workers.installer,
    OUTFITTING_DEPLOY_DOCS: config.docs ? "1" : "0",
    OUTFITTING_DOMAIN: config.domain ?? "",
    OUTFITTING_INSTALLER_HOSTS: config.installerHosts.join(","),
  };
}
