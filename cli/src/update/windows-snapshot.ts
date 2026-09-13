import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Console, Effect, Option, Schema } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { CliFailure } from "@/errors";
import { pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which } from "@/process";
import { ui } from "@/ui";
import { parseBunGlobalList, type BunPackageEntry } from "@/update/bun";
import { runScoopCommand } from "@/update/scoop-command";

export const SCOOP_INVENTORY_KIND = "scoop-inventory";
export const SCOOP_INVENTORY_FORMAT = "outfitting-scoop-inventory-v1";
export const BUN_GLOBAL_INVENTORY_KIND = "bun-global-inventory";
export const BUN_GLOBAL_INVENTORY_FORMAT = "outfitting-bun-global-inventory-v1";
export const WINGET_INVENTORY_KIND = "winget";

export interface ScoopExportApp {
  Name: string;
  Source: string;
  Version: string;
  Info: string;
}

export interface ScoopExportBucket {
  Name: string;
  Source: string;
}

export interface ScoopExportState {
  apps: ScoopExportApp[];
  buckets: ScoopExportBucket[];
}

const ScoopExportAppSchema = Schema.Struct({
  Name: Schema.String,
  Source: Schema.optionalKey(Schema.NullOr(Schema.String)),
  Version: Schema.String,
  Info: Schema.String,
});

const ScoopExportBucketSchema = Schema.Struct({
  Name: Schema.String,
  Source: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

const ScoopExportSchema = Schema.Struct({
  apps: Schema.ArrayEnsure(ScoopExportAppSchema),
  buckets: Schema.ArrayEnsure(ScoopExportBucketSchema),
});

type DecodedScoopExport = Schema.Schema.Type<typeof ScoopExportSchema>;

const decodeScoopExport = Schema.decodeUnknownOption(ScoopExportSchema);

function normalizeScoopExport(decoded: DecodedScoopExport): ScoopExportState {
  return {
    apps: decoded.apps.map((app) => ({
      Name: app.Name,
      Source: app.Source ?? "",
      Version: app.Version,
      Info: app.Info,
    })),
    buckets: decoded.buckets.map((bucket) => ({
      Name: bucket.Name,
      Source: bucket.Source ?? "",
    })),
  };
}

/** Parse the stable JSON object emitted by `scoop export`. */
export function parseScoopExport(output: string): ScoopExportState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch (cause) {
    throw new Error(
      `Unable to parse Scoop export: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  const decoded = decodeScoopExport(parsed);
  if (Option.isNone(decoded)) {
    throw new Error("Scoop export must contain valid apps and buckets.");
  }
  return normalizeScoopExport(decoded.value);
}

function stableScoopInventory(state: ScoopExportState): string {
  const apps = state.apps.toSorted((left, right) =>
    `${left.Name}\u0000${left.Source}`.localeCompare(`${right.Name}\u0000${right.Source}`, "en"),
  );
  const buckets = state.buckets.toSorted((left, right) =>
    `${left.Name}\u0000${left.Source}`.localeCompare(`${right.Name}\u0000${right.Source}`, "en"),
  );
  return `${JSON.stringify(
    {
      format: SCOOP_INVENTORY_FORMAT,
      apps,
      buckets,
    },
    null,
    2,
  )}\n`;
}

/** Capture a stable Scoop inventory without timestamps or command noise. */
export async function captureScoopInventory(
  run: typeof runCommand = runCommand,
  scoopPath?: string,
): Promise<string> {
  const result = scoopPath
    ? await runScoopCommand(run, scoopPath, ["export"], { inherit: false })
    : await run("scoop", ["export"], { inherit: false });
  if (result.code !== 0) {
    throw new Error(
      `scoop export failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
    );
  }
  return stableScoopInventory(parseScoopExport(result.stdout));
}

function stableBunInventory(packages: ReadonlyArray<BunPackageEntry>): string {
  return `${JSON.stringify(
    {
      format: BUN_GLOBAL_INVENTORY_FORMAT,
      packages: [...new Set(packages.map((entry) => entry.name))].toSorted((left, right) =>
        left.localeCompare(right, "en"),
      ),
    },
    null,
    2,
  )}\n`;
}

/** Capture global Bun package names in the same stable format as the Windows profile. */
export async function captureBunGlobalInventory(
  run: typeof runCommand = runCommand,
): Promise<string> {
  const result = await run("bun", ["pm", "ls", "-g"], { inherit: false });
  if (result.code !== 0) {
    throw new Error(
      `bun pm ls -g failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
    );
  }
  return stableBunInventory(parseBunGlobalList(result.stdout));
}

export interface WindowsSnapshotOptions {
  config?: ManagerConfig;
  run?: typeof runCommand;
  scoopPath?: string;
  which?: typeof which;
}

const pushTextSnapshot = (options: {
  config: ManagerConfig;
  kind: string;
  filename: string;
  body: string;
}) =>
  Effect.gen(function* () {
    const directory = yield* tryPromise(() =>
      mkdtemp(join(tmpdir(), "outfitting-windows-snapshot-")),
    );
    const path = join(directory, options.filename);
    try {
      yield* tryPromise(() => writeFile(path, options.body, "utf8"));
      yield* pushLockfile({
        machine: options.config.machineId,
        kind: options.kind,
        path,
      });
    } finally {
      yield* tryPromise(() => rm(directory, { force: true, recursive: true }));
    }
  });

/** Capture and push the current Scoop inventory. */
export const pushScoopInventory = (options: WindowsSnapshotOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const scoopPath =
      options.scoopPath ??
      (yield* tryPromise(() => (options.which ?? which)("scoop"))) ??
      (yield* new CliFailure({ message: "Scoop is not installed or not in PATH." }));
    yield* Console.log(ui.heading("Capturing Scoop inventory…"));
    const body = yield* tryPromise(() => captureScoopInventory(run, scoopPath));
    yield* pushTextSnapshot({
      config,
      kind: SCOOP_INVENTORY_KIND,
      filename: "scoop-inventory.json",
      body,
    });
    yield* Console.log(ui.success("Scoop inventory stored."));
  });

/** Capture and push global Bun package names. */
export const pushBunGlobalInventory = (options: WindowsSnapshotOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    yield* Console.log(ui.heading("Capturing global Bun inventory…"));
    const body = yield* tryPromise(() => captureBunGlobalInventory(run));
    yield* pushTextSnapshot({
      config,
      kind: BUN_GLOBAL_INVENTORY_KIND,
      filename: "bun-global-inventory.json",
      body,
    });
    yield* Console.log(ui.success("Global Bun inventory stored."));
  });

export async function exportWingetInventory(
  outputPath: string,
  run: typeof runCommand = runCommand,
): Promise<string> {
  const result = await run(
    "winget",
    ["export", "--output", outputPath, "--accept-source-agreements"],
    { inherit: true },
  );
  if (result.code !== 0) {
    throw new Error(
      `winget export failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
    );
  }
  const output = await stat(outputPath).catch(() => undefined);
  if (!output?.isFile()) {
    throw new Error("winget export completed without creating an inventory file.");
  }
  return outputPath;
}

/** Export and push the current WinGet package state. */
export const pushWingetInventory = (options: WindowsSnapshotOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const directory = yield* tryPromise(() =>
      mkdtemp(join(tmpdir(), "outfitting-winget-snapshot-")),
    );
    const path = join(directory, "winget.json");
    try {
      yield* Console.log(ui.heading("Capturing WinGet inventory…"));
      yield* tryPromise(() => exportWingetInventory(path, run));
      yield* pushLockfile({
        machine: config.machineId,
        kind: WINGET_INVENTORY_KIND,
        path,
      });
      yield* Console.log(ui.success("WinGet inventory stored."));
    } finally {
      yield* tryPromise(() => rm(directory, { force: true, recursive: true }));
    }
  });
