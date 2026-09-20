import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";

import { Option, Schema } from "effect";

import { stateRoot, type ManagerConfig } from "@/config";

export const WINDOWS_LOCK_KIND = "windows";
export const WINDOWS_LOCK_FORMAT = "outfitting-windows-lock-v1";
const MAX_OPERATION_HISTORY = 100;

export function wingetSource(args: ReadonlyArray<string>): "winget" | "msstore" {
  const index = args.indexOf("--source");
  return index >= 0 && args[index + 1]?.toLowerCase() === "msstore" ? "msstore" : "winget";
}

export function wingetIdentity(name: string, source = "winget"): string {
  return `${source}:${name}`.toLowerCase();
}

function isHresult(code: number, hresult: number): boolean {
  return code === hresult || code >>> 0 === hresult >>> 0;
}

/** WinGet's documented result when an exact `list` query finds no package. */
export function isWingetPackageAbsentExitCode(code: number): boolean {
  return isHresult(code, 0x8a150014);
}

/** Documented WinGet no-op results that prove an install did not take ownership. */
export function isWingetAlreadyInstalledExitCode(code: number): boolean {
  return [0x8a15002b, 0x8a150061, 0x8a15010d].some((hresult) => isHresult(code, hresult));
}

export type WindowsPackageManager = "winget" | "scoop" | "bun";
export type WindowsPackageAction = "install" | "uninstall" | "upgrade";
export type WindowsOperationStatus = "success" | "failed";

export interface WindowsPackageRecord {
  name: string;
  args: string[];
  origin: "baseline" | "manual";
  /** Present only when Outfitting observed its own successful installation. */
  installedBy?: "outfitting";
  /** Profiles that required an Outfitting-installed baseline package. */
  owners?: ReadonlyArray<string>;
}

export interface WindowsOperationRecord {
  at: string;
  manager: WindowsPackageManager;
  action: WindowsPackageAction;
  name: string;
  args: string[];
  status: WindowsOperationStatus;
  exitCode?: number;
}

export interface WindowsLock {
  format: typeof WINDOWS_LOCK_FORMAT;
  machine: string;
  source: {
    baseUrl: string;
    ref: string;
  };
  profiles: string[];
  packages: Record<WindowsPackageManager, WindowsPackageRecord[]>;
  operations: WindowsOperationRecord[];
}

export interface WindowsLockOperationInput {
  config: ManagerConfig;
  manager: WindowsPackageManager;
  action: WindowsPackageAction;
  name: string;
  args: ReadonlyArray<string>;
  status: WindowsOperationStatus;
  exitCode?: number;
  origin?: WindowsPackageRecord["origin"];
  installedBy?: WindowsPackageRecord["installedBy"];
  owners?: ReadonlyArray<string>;
}

export interface WindowsLockPathOptions {
  root?: string;
}

export function windowsLockPath({ root = stateRoot() }: WindowsLockPathOptions = {}): string {
  return join(root, "windows.lock.json");
}

function newWindowsLock(config: ManagerConfig): WindowsLock {
  return {
    format: WINDOWS_LOCK_FORMAT,
    machine: config.machineId || hostname(),
    source: { ...config.manifest },
    profiles: [],
    packages: { winget: [], scoop: [], bun: [] },
    operations: [],
  };
}

const WindowsPackageRecordSchema = Schema.Struct({
  name: Schema.String,
  args: Schema.Array(Schema.String),
  origin: Schema.Literals(["baseline", "manual"] as const),
  installedBy: Schema.optional(Schema.Literal("outfitting")),
  owners: Schema.optional(Schema.Array(Schema.String)),
});

const WindowsOperationSchema = Schema.Struct({
  at: Schema.String,
  manager: Schema.Literals(["winget", "scoop", "bun"] as const),
  action: Schema.Literals(["install", "uninstall", "upgrade"] as const),
  name: Schema.String,
  args: Schema.Array(Schema.String),
  status: Schema.Literals(["success", "failed"] as const),
  exitCode: Schema.optional(Schema.Finite),
});

const WindowsLockSchema = Schema.Struct({
  format: Schema.Literal(WINDOWS_LOCK_FORMAT),
  machine: Schema.String,
  source: Schema.Struct({
    baseUrl: Schema.String,
    ref: Schema.String,
  }),
  profiles: Schema.Array(Schema.String),
  packages: Schema.Struct({
    winget: Schema.Array(WindowsPackageRecordSchema),
    scoop: Schema.Array(WindowsPackageRecordSchema),
    bun: Schema.Array(WindowsPackageRecordSchema),
  }),
  operations: Schema.Array(WindowsOperationSchema),
});

const decodeWindowsLock = Schema.decodeUnknownOption(WindowsLockSchema);

function clonePackageRecord(
  entry: Omit<WindowsPackageRecord, "args"> & { readonly args: ReadonlyArray<string> },
): WindowsPackageRecord {
  return {
    name: entry.name,
    args: [...entry.args],
    origin: entry.origin,
    installedBy: entry.installedBy,
    owners: entry.owners === undefined ? undefined : [...entry.owners],
  };
}

async function readWindowsLockFile(path: string): Promise<WindowsLock | undefined> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
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
  const decoded = decodeWindowsLock(JSON.parse(content) as object);
  if (Option.isNone(decoded)) {
    throw new Error(`Invalid Windows lockfile: ${path}`);
  }
  return {
    format: WINDOWS_LOCK_FORMAT,
    machine: decoded.value.machine,
    source: { ...decoded.value.source },
    profiles: [...decoded.value.profiles],
    packages: {
      winget: decoded.value.packages.winget.map(clonePackageRecord),
      scoop: decoded.value.packages.scoop.map(clonePackageRecord),
      bun: decoded.value.packages.bun.map(clonePackageRecord),
    },
    operations: decoded.value.operations.map((operation) => ({
      ...operation,
      args: [...operation.args],
    })),
  };
}

export async function readWindowsLock(
  config: ManagerConfig,
  options: WindowsLockPathOptions = {},
): Promise<WindowsLock> {
  const path = windowsLockPath({ root: options.root ?? config.stateRoot });
  return (await readWindowsLockFile(path)) ?? newWindowsLock(config);
}

export async function writeWindowsLock(
  lock: WindowsLock,
  options: WindowsLockPathOptions = {},
): Promise<string> {
  const path = windowsLockPath(options);
  await mkdir(options.root ?? stateRoot(), { recursive: true });
  await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  return path;
}

function updateTrackedPackage(
  lock: WindowsLock,
  input: WindowsLockOperationInput,
  identity: string,
): void {
  if (input.status !== "success" || input.action === "upgrade") {
    return;
  }
  const entries = lock.packages[input.manager];
  const index = entries.findIndex((entry) =>
    input.manager === "winget"
      ? wingetIdentity(entry.name, wingetSource(entry.args)) ===
        wingetIdentity(identity, wingetSource(input.args))
      : entry.name.toLowerCase() === identity.toLowerCase(),
  );
  if (input.action === "install") {
    const record: WindowsPackageRecord = {
      name: identity,
      args: [...input.args],
      origin: input.origin ?? "manual",
      installedBy: input.installedBy,
      owners: input.owners === undefined ? undefined : [...new Set(input.owners)].toSorted(),
    };
    if (index === -1) {
      entries.push(record);
    } else {
      entries[index] = record;
    }
  } else if (index !== -1) {
    entries.splice(index, 1);
  }
  lock.packages[input.manager] = entries.toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export async function recordWindowsOperation(
  input: WindowsLockOperationInput,
  options: WindowsLockPathOptions = {},
): Promise<string> {
  const root = options.root ?? input.config.stateRoot;
  const lock = await readWindowsLock(input.config, { root });
  lock.machine = input.config.machineId;
  lock.source = { ...input.config.manifest };
  const identity =
    input.manager === "scoop" ? (input.name.split("/").at(-1) ?? input.name) : input.name;
  const operation: WindowsOperationRecord = {
    at: new Date().toISOString(),
    manager: input.manager,
    action: input.action,
    name: input.name,
    args: [...input.args],
    status: input.status,
  };
  if (input.exitCode !== undefined) {
    operation.exitCode = input.exitCode;
  }
  lock.operations = [...lock.operations, operation].slice(-MAX_OPERATION_HISTORY);
  updateTrackedPackage(lock, input, identity);
  return writeWindowsLock(lock, { root });
}
