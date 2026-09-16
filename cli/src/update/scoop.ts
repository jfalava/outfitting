import { Console, Data, Effect } from "effect";

import { loadConfig, resolveWindowsRoutes, type ManagerConfig } from "@/config";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which } from "@/process";
import { ui } from "@/ui";
import { runScoopCommand } from "@/update/scoop-command";
import {
  WINDOWS_LOCK_KIND,
  updateWindowsBaseline,
  type WindowsPackageRecord,
} from "@/update/windows-lock";
import { parseScoopExport, type ScoopExportState } from "@/update/windows-snapshot";

export const SCOOP_MANIFEST_PATH = "packages/windows/scoop.txt";

class ScoopUpdateError extends Data.TaggedError("ScoopUpdateError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface ScoopBucket {
  name: string;
  url: string;
}

export interface ScoopManifest {
  buckets: ScoopBucket[];
  packages: string[];
}

function bucketNameFromUrl(value: string): string | undefined {
  const normalized = value
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  const last = segments.at(-1);
  if (last === undefined) {
    return undefined;
  }
  const name = last.replace(/^scoop-/i, "");
  return name.length > 0 ? name : undefined;
}

/** Parse the repository-owned Scoop desired-state manifest. */
export function parseScoopManifest(content: string): ScoopManifest {
  const buckets: ScoopBucket[] = [];
  const packages: string[] = [];
  const bucketNames = new Set<string>();
  const packageNames = new Set<string>();
  const invalid: string[] = [];

  content.split(/\r?\n/).forEach((raw, index) => {
    const entry = raw.trim();
    if (entry.length === 0 || entry.startsWith("#")) {
      return;
    }

    const bucket = /^bucket\s+"([^"\r\n]*\S[^"\r\n]*)"$/i.exec(entry);
    if (bucket?.[1] !== undefined) {
      const url = bucket[1].trim();
      const name = bucketNameFromUrl(url);
      if (name === undefined || bucketNames.has(name.toLowerCase())) {
        invalid.push(`line ${index + 1}: invalid or duplicate bucket '${url}'`);
        return;
      }
      bucketNames.add(name.toLowerCase());
      buckets.push({ name, url });
      return;
    }

    const packageMatch = /^package\s+"([^"\r\n]*\S[^"\r\n]*)"$/i.exec(entry);
    if (packageMatch?.[1] !== undefined) {
      const packageSpec = packageMatch[1].trim();
      const name = packageSpec.split("/").at(-1);
      if (name === undefined || packageNames.has(name.toLowerCase())) {
        invalid.push(`line ${index + 1}: invalid or duplicate package '${packageSpec}'`);
        return;
      }
      packageNames.add(name.toLowerCase());
      packages.push(packageSpec);
      return;
    }

    invalid.push(`line ${index + 1}: ${entry}`);
  });

  if (invalid.length > 0) {
    throw new Error(`Invalid Scoop manifest entries: ${invalid.join("; ")}`);
  }
  if (packages.length === 0) {
    throw new Error("The Scoop manifest contains no packages; refusing an empty desired state.");
  }

  return { buckets, packages };
}

function packageName(value: string): string {
  return value.split("/").at(-1) ?? value;
}

function isGlobalInstall(app: { Info: string }): boolean {
  return /\bGlobal install\b/i.test(app.Info);
}

function installedBuckets(state: ScoopExportState): Set<string> {
  return new Set(state.buckets.map((bucket) => bucket.Name.toLowerCase()));
}

function installedPackages(state: ScoopExportState): Set<string> {
  return new Set(
    state.apps.filter((app) => !isGlobalInstall(app)).map((app) => app.Name.toLowerCase()),
  );
}

const scoopState = Effect.fn("scoopState")(function* (run: typeof runCommand, scoopPath: string) {
  const result = yield* tryPromise(() =>
    runScoopCommand(run, scoopPath, ["export"], { inherit: false }),
  );
  if (result.code !== 0) {
    return yield* new ScoopUpdateError({
      message:
        `scoop export failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
    });
  }
  return yield* Effect.try({
    try: () => parseScoopExport(result.stdout),
    catch: (cause) =>
      new ScoopUpdateError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });
});

const requireScoopCommand = Effect.fn("requireScoopCommand")(function* (
  run: typeof runCommand,
  scoopPath: string,
  args: ReadonlyArray<string>,
  label: string,
) {
  const result = yield* tryPromise(() => runScoopCommand(run, scoopPath, args, { inherit: true }));
  if (result.code !== 0) {
    return yield* new ScoopUpdateError({
      message: `${label} failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
    });
  }
  return result;
});

const addMissingBuckets = Effect.fn("addMissingBuckets")(function* (
  desired: ScoopManifest,
  installed: ReadonlySet<string>,
  run: typeof runCommand,
  scoopPath: string,
) {
  for (const bucket of desired.buckets) {
    if (installed.has(bucket.name.toLowerCase())) {
      continue;
    }
    yield* requireScoopCommand(
      run,
      scoopPath,
      ["bucket", "add", bucket.name, bucket.url],
      `scoop bucket add ${bucket.name}`,
    );
  }
});

const installMissingPackages = Effect.fn("installMissingPackages")(function* (
  desired: ScoopManifest,
  installed: ReadonlySet<string>,
  run: typeof runCommand,
  scoopPath: string,
) {
  for (const spec of desired.packages) {
    if (installed.has(packageName(spec).toLowerCase())) {
      continue;
    }
    yield* requireScoopCommand(run, scoopPath, ["install", spec], `scoop install ${spec}`);
  }
});

const updateAndCleanScoop = Effect.fn("updateAndCleanScoop")(function* (
  run: typeof runCommand,
  scoopPath: string,
) {
  yield* requireScoopCommand(run, scoopPath, ["update"], "scoop update");
  yield* requireScoopCommand(run, scoopPath, ["update", "*"], "scoop update *");
  yield* requireScoopCommand(run, scoopPath, ["cleanup", "*"], "scoop cleanup *");
});

export interface UpdateScoopOptions {
  config?: ManagerConfig;
  noSync?: boolean;
  /** Reuse an already parsed Scoop manifest instead of fetching it again. */
  manifest?: ScoopManifest;
  scoopPath?: string;
  run?: typeof runCommand;
  which?: typeof which;
  fetcher?: ManifestFetcher;
}

/** Install manifest packages and update Scoop without removing extra packages. */
export const updateScoop = (options: UpdateScoopOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    const whichFn = options.which ?? which;
    const scoopPath = options.scoopPath ?? (yield* tryPromise(() => whichFn("scoop")));
    if (scoopPath === undefined) {
      return yield* new ScoopUpdateError({ message: "Scoop is not installed or not in PATH." });
    }

    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    let desired: ScoopManifest;
    if (options.manifest !== undefined) {
      desired = options.manifest;
    } else {
      const manifest = yield* tryPromise(() =>
        fetchManifest({
          path: resolveWindowsRoutes(config.windows).scoopPath,
          config,
          materialize: true,
          fetcher: options.fetcher,
        }),
      );
      if (manifest.warning) {
        yield* Console.log(ui.muted(manifest.warning));
      }
      desired = yield* Effect.try({
        try: () => parseScoopManifest(manifest.text),
        catch: (cause) =>
          new ScoopUpdateError({
            message: cause instanceof Error ? cause.message : String(cause),
            cause,
          }),
      });
    }
    const state = yield* scoopState(run, scoopPath);
    const buckets = installedBuckets(state);

    yield* Console.log(ui.heading("Reconciling Scoop packages…"));
    yield* addMissingBuckets(desired, buckets, run, scoopPath);

    yield* installMissingPackages(desired, installedPackages(state), run, scoopPath);

    yield* updateAndCleanScoop(run, scoopPath);
    yield* Console.log(ui.success("Scoop packages updated; extra packages were preserved."));

    if (options.noSync) {
      yield* Console.log(ui.muted("Skipped lock sync (--no-sync)."));
    } else {
      const records: WindowsPackageRecord[] = desired.packages.map((name) => ({
        name: packageName(name),
        args: ["install", name],
        origin: "baseline",
      }));
      const lock = yield* tryPromise(() => updateWindowsBaseline(config, { scoop: records }));
      yield* pushLockfile({
        machine: config.machineId,
        kind: WINDOWS_LOCK_KIND,
        path: lock,
      });
    }
  });

export { captureScoopInventory, parseScoopExport } from "@/update/windows-snapshot";
