import { Console, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which, type RunCommandResult } from "@/process";
import { ui } from "@/ui";
import { runScoopCommand, scoopScriptPath } from "@/update/scoop-command";
import {
  parseScoopExport,
  pushScoopInventory,
  type ScoopExportState,
} from "@/update/windows-snapshot";

export const SCOOP_MANIFEST_PATH = "packages/windows/scoop.txt";

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
      const packageName = packageMatch[1].trim();
      const name = packageName.split("/").at(-1);
      if (name === undefined || packageNames.has(name.toLowerCase())) {
        invalid.push(`line ${index + 1}: invalid or duplicate package '${packageName}'`);
        return;
      }
      packageNames.add(name.toLowerCase());
      packages.push(packageName);
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

function parseScoopDependencies(output: string, packageSpec: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch (cause) {
    throw new Error(
      `Unable to parse Scoop dependencies for ${packageSpec}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const names: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`Scoop dependencies for ${packageSpec} contain an invalid entry.`);
    }
    const name = (entry as { Name?: unknown }).Name;
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new Error(`Scoop dependencies for ${packageSpec} contain an invalid package name.`);
    }
    names.push(name.trim());
  }
  return names;
}

function powerShellStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function scoopState(run: typeof runCommand, scoopPath: string): Promise<ScoopExportState> {
  const result = await runScoopCommand(run, scoopPath, ["export"], { inherit: false });
  if (result.code !== 0) {
    throw new Error(
      `scoop export failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
    );
  }
  return parseScoopExport(result.stdout);
}

async function requireScoopCommand(
  run: typeof runCommand,
  scoopPath: string,
  args: ReadonlyArray<string>,
  label: string,
  inherit = true,
): Promise<RunCommandResult> {
  const result = await runScoopCommand(run, scoopPath, args, { inherit });
  if (result.code !== 0) {
    throw new Error(
      `${label} failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
    );
  }
  return result;
}

async function dependencyNames(
  packageSpec: string,
  scoopPath: string,
  run: typeof runCommand,
): Promise<string[]> {
  const result = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$ErrorActionPreference = 'Stop'; $dependencies = @(& ${powerShellStringLiteral(scoopScriptPath(scoopPath))} depends -- ${powerShellStringLiteral(packageSpec)}); if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; $dependencies | ConvertTo-Json -Compress`,
    ],
    { inherit: false },
  );
  if (result.code !== 0) {
    throw new Error(
      `powershell.exe scoop depends ${packageSpec} failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
    );
  }
  return parseScoopDependencies(result.stdout, packageSpec);
}

export interface UpdateScoopOptions {
  config?: ManagerConfig;
  noSync?: boolean;
  scoopPath?: string;
  run?: typeof runCommand;
  which?: typeof which;
  fetcher?: ManifestFetcher;
}

/** Reconcile Scoop with the cached/fetched repository desired state. */
export const updateScoop = (options: UpdateScoopOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    const whichFn = options.which ?? which;
    const scoopPath = options.scoopPath ?? (yield* tryPromise(() => whichFn("scoop")));
    if (scoopPath === undefined) {
      return yield* Effect.fail(new Error("Scoop is not installed or not in PATH."));
    }

    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const manifest = yield* tryPromise(() =>
      fetchManifest({
        path: SCOOP_MANIFEST_PATH,
        config,
        materialize: true,
        fetcher: options.fetcher,
      }),
    );
    if (manifest.warning) {
      yield* Console.log(ui.muted(manifest.warning));
    }
    const desired = yield* Effect.try({
      try: () => parseScoopManifest(manifest.text),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const state = yield* tryPromise(() => scoopState(run, scoopPath));
    const buckets = installedBuckets(state);

    yield* Console.log(ui.heading("Reconciling Scoop packages…"));
    for (const bucket of desired.buckets) {
      if (buckets.has(bucket.name.toLowerCase())) {
        continue;
      }
      yield* tryPromise(() =>
        requireScoopCommand(
          run,
          scoopPath,
          ["bucket", "add", bucket.name, bucket.url],
          `scoop bucket add ${bucket.name}`,
        ),
      );
    }

    const packages = installedPackages(state);
    for (const spec of desired.packages) {
      if (!packages.has(packageName(spec).toLowerCase())) {
        yield* tryPromise(() =>
          requireScoopCommand(run, scoopPath, ["install", spec], `scoop install ${spec}`),
        );
      }
    }

    const desiredPackages = new Set(
      desired.packages.map((spec) => packageName(spec).toLowerCase()),
    );
    for (const spec of desired.packages) {
      const dependencies = yield* tryPromise(() => dependencyNames(spec, scoopPath, run));
      for (const dependency of dependencies) {
        desiredPackages.add(dependency.toLowerCase());
      }
    }

    const current = yield* tryPromise(() => scoopState(run, scoopPath));
    for (const app of current.apps) {
      if (!isGlobalInstall(app) && !desiredPackages.has(app.Name.toLowerCase())) {
        yield* tryPromise(() =>
          requireScoopCommand(
            run,
            scoopPath,
            ["uninstall", app.Name],
            `scoop uninstall ${app.Name}`,
          ),
        );
      }
    }

    yield* tryPromise(() => requireScoopCommand(run, scoopPath, ["update"], "scoop update"));
    yield* tryPromise(() => requireScoopCommand(run, scoopPath, ["update", "*"], "scoop update *"));
    yield* tryPromise(() =>
      requireScoopCommand(run, scoopPath, ["cleanup", "*"], "scoop cleanup *"),
    );
    yield* Console.log(ui.success("Scoop packages match scoop.txt."));

    if (options.noSync) {
      yield* Console.log(ui.muted("Skipped inventory sync (--no-sync)."));
    } else {
      yield* pushScoopInventory({ config, run, scoopPath });
    }
  });

export { captureScoopInventory, parseScoopExport } from "@/update/windows-snapshot";
