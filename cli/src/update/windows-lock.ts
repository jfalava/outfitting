import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";

import { Option, Schema } from "effect";

import { stateRoot, type ManagerConfig } from "@/config";

export const WINDOWS_LOCK_KIND = "windows";
export const WINDOWS_LOCK_FORMAT = "outfitting-windows-lock-v1";
const MAX_OPERATION_HISTORY = 100;

/** WinGet uses either representation for update-not-applicable on Windows. */
export function isWingetAlreadyInstalledExitCode(code: number): boolean {
  return code === 43 || code === -1978335189;
}

export type WindowsPackageManager = "winget" | "scoop" | "bun";
export type WindowsPackageAction = "install" | "uninstall" | "upgrade";
export type WindowsOperationStatus = "success" | "failed";

export interface WindowsPackageRecord {
  name: string;
  args: string[];
  origin: "baseline" | "manual";
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
      winget: decoded.value.packages.winget.map((entry) => ({ ...entry, args: [...entry.args] })),
      scoop: decoded.value.packages.scoop.map((entry) => ({ ...entry, args: [...entry.args] })),
      bun: decoded.value.packages.bun.map((entry) => ({ ...entry, args: [...entry.args] })),
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

  if (input.status === "success" && (input.action === "install" || input.action === "uninstall")) {
    const entries = lock.packages[input.manager];
    const index = entries.findIndex((entry) => entry.name.toLowerCase() === identity.toLowerCase());
    if (input.action === "install") {
      const record: WindowsPackageRecord = {
        name: identity,
        args: [...input.args],
        origin: "manual",
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

  return writeWindowsLock(lock, { root });
}

export async function updateWindowsBaseline(
  config: ManagerConfig,
  updates: Partial<Record<WindowsPackageManager, ReadonlyArray<WindowsPackageRecord>>>,
  profiles?: ReadonlyArray<string>,
  options: WindowsLockPathOptions = {},
): Promise<string> {
  const root = options.root ?? config.stateRoot;
  const lock = await readWindowsLock(config, { root });
  lock.machine = config.machineId;
  lock.source = { ...config.manifest };
  if (profiles !== undefined) {
    lock.profiles = [...new Set(profiles)].toSorted();
  }
  for (const manager of ["winget", "scoop", "bun"] as const) {
    const records = updates[manager];
    if (records === undefined) {
      continue;
    }
    lock.packages[manager] = [...records]
      .map((record) => ({ ...record, args: [...record.args] }))
      .toSorted((left, right) => left.name.localeCompare(right.name));
  }
  return writeWindowsLock(lock, { root });
}
