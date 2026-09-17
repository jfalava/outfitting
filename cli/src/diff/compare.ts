import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Console, Effect, Option, Schema } from "effect";

import { parseWindowsPackageList, resolveWindowsProfiles } from "@/commands/windows-sync";
import {
  loadConfig,
  resolveOutfittingRepo,
  resolveWindowsRoutes,
  type ManagerConfig,
  type OutfittingRepo,
} from "@/config";
import type { DiffManager, DiffPlatform, DiffSection, PlatformDiff } from "@/diff/types";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { pullLockfile } from "@/lockfiles";
import { runCommand, which } from "@/process";
import { parseBrewfileManifest, BREWFILE_MANIFEST_PATH } from "@/update/brew";
import { dryRunNixSystem } from "@/update/nix/build";
import { closeNixLock, openNixLock } from "@/update/nix/lock";
import { parseScoopManifest, type ScoopManifest } from "@/update/scoop";
import { runScoopCommand } from "@/update/scoop-command";
import { readWindowsLock } from "@/update/windows-lock";
import { parseScoopExport, type ScoopExportState } from "@/update/windows-snapshot";

const MACOS_MANAGERS = ["brew", "nix"] as const satisfies ReadonlyArray<DiffManager>;
const WINDOWS_MANAGERS = ["winget", "scoop"] as const satisfies ReadonlyArray<DiffManager>;

export interface CollectDiffOptions {
  platform: DiffPlatform;
  manager?: string;
  profiles?: ReadonlyArray<string>;
  offline?: boolean;
  config?: ManagerConfig;
  fetcher?: ManifestFetcher;
  run?: typeof runCommand;
  which?: typeof which;
}

interface NamedValue {
  name: string;
  value?: string;
}

interface DiffContext {
  config: ManagerConfig;
  run: typeof runCommand;
  which: typeof which;
  fetcher: ManifestFetcher | undefined;
  offline: boolean;
}

interface WindowsDiffOptions {
  manager: Extract<DiffManager, "winget" | "scoop">;
  profiles: ReadonlyArray<string> | undefined;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function sectionStatus(
  missing: ReadonlyArray<string>,
  extra: ReadonlyArray<string>,
  changed: ReadonlyArray<string>,
) {
  return missing.length > 0 || extra.length > 0 || changed.length > 0 ? "different" : "same";
}

function emptySection(manager: DiffManager, message?: string): DiffSection {
  const section: DiffSection = {
    manager,
    status: "same",
    missing: [],
    extra: [],
    changed: [],
  };
  if (message !== undefined) {
    section.message = message;
  }
  return section;
}

function unavailableSection(
  manager: DiffManager,
  message: string,
): DiffSection {
  return {
    manager,
    status: "unavailable",
    missing: [],
    extra: [],
    changed: [],
    message,
  };
}

function compareSets(
  manager: DiffManager,
  desired: ReadonlyArray<NamedValue>,
  actual: ReadonlyArray<NamedValue>,
): DiffSection {
  const desiredMap = new Map(desired.map((item) => [item.name.toLowerCase(), item]));
  const actualMap = new Map(actual.map((item) => [item.name.toLowerCase(), item]));
  const missing: string[] = [];
  const extra: string[] = [];
  const changed: string[] = [];

  for (const [key, item] of desiredMap) {
    const current = actualMap.get(key);
    if (current === undefined) {
      missing.push(item.name);
    } else if (
      item.value !== undefined &&
      current.value !== undefined &&
      item.value.toLowerCase() !== current.value.toLowerCase()
    ) {
      changed.push(`${item.name}: ${current.value} → ${item.value}`);
    }
  }
  for (const [key, item] of actualMap) {
    if (!desiredMap.has(key)) {
      extra.push(item.name);
    }
  }

  missing.sort((left, right) => left.localeCompare(right, "en"));
  extra.sort((left, right) => left.localeCompare(right, "en"));
  changed.sort((left, right) => left.localeCompare(right, "en"));
  return {
    manager,
    status: sectionStatus(missing, extra, changed),
    missing,
    extra,
    changed,
  };
}

function prefixed(values: ReadonlyArray<string>, prefix: string): NamedValue[] {
  return values.map((name) => ({ name: `${prefix}: ${name}` }));
}

function compareBrew(
  desired: ReturnType<typeof parseBrewfileManifest>,
  actual: ReturnType<typeof parseBrewfileManifest>,
): DiffSection {
  const result = compareSets(
    "brew",
    [
      ...prefixed(desired.taps, "tap"),
      ...prefixed(desired.formulae, "formula"),
      ...prefixed(desired.casks, "cask"),
    ],
    [
      ...prefixed(actual.taps, "tap"),
      ...prefixed(actual.formulae, "formula"),
      ...prefixed(actual.casks, "cask"),
    ],
  );
  result.message = "Compares taps, direct formulae, and casks; Homebrew dependencies are omitted.";
  return result;
}

function compareScoop(desired: ScoopManifest, actual: ScoopExportState): DiffSection {
  const desiredBuckets = desired.buckets.map((bucket) => ({
    name: bucket.name,
    value: bucket.url,
  }));
  const actualBuckets = actual.buckets.map((bucket) => ({
    name: bucket.Name,
    value: bucket.Source,
  }));
  const desiredPackages = desired.packages.map((spec) => ({ name: packageName(spec) }));
  const actualPackages = actual.apps
    .filter((app) => !/\bGlobal install\b/i.test(app.Info))
    .map((app) => ({ name: app.Name }));
  const buckets = compareSets("scoop", desiredBuckets, actualBuckets);
  const packages = compareSets("scoop", desiredPackages, actualPackages);
  const missing = [
    ...buckets.missing.map((name) => `bucket: ${name}`),
    ...packages.missing.map((name) => `package: ${name}`),
  ];
  const extra = [
    ...buckets.extra.map((name) => `bucket: ${name}`),
    ...packages.extra.map((name) => `package: ${name}`),
  ];
  const changed = [...buckets.changed, ...packages.changed.map((name) => `package: ${name}`)];
  missing.sort((left, right) => left.localeCompare(right, "en"));
  extra.sort((left, right) => left.localeCompare(right, "en"));
  changed.sort((left, right) => left.localeCompare(right, "en"));
  return {
    manager: "scoop",
    status: sectionStatus(missing, extra, changed),
    missing,
    extra,
    changed,
  };
}

function packageName(value: string): string {
  return value.split("/").at(-1) ?? value;
}

const WingetPackageSchema = Schema.Struct({
  PackageIdentifier: Schema.String,
});

const WingetExportSchema = Schema.Struct({
  Sources: Schema.ArrayEnsure(
    Schema.Struct({
      Packages: Schema.ArrayEnsure(WingetPackageSchema),
    }),
  ),
});

const decodeWingetExport = Schema.decodeUnknownOption(WingetExportSchema);

export function parseWingetExport(content: string): string[] {
  let parsed: object;
  try {
    parsed = JSON.parse(content) as object;
  } catch (cause) {
    throw new Error(`Unable to parse WinGet export: ${errorMessage(cause)}`, { cause });
  }

  const decoded = decodeWingetExport(parsed);
  if (Option.isNone(decoded)) {
    throw new Error("WinGet export must contain valid package sources.");
  }
  return [
    ...new Set(
      decoded.value.Sources.flatMap((source) =>
        source.Packages.map((pkg) => pkg.PackageIdentifier),
      ),
    ),
  ].toSorted((left, right) => left.localeCompare(right, "en"));
}

async function captureWingetPackages(
  executable: string,
  run: typeof runCommand,
): Promise<string[]> {
  const directory = await mkdtemp(join(tmpdir(), "outfitting-diff-winget-"));
  const path = join(directory, "winget.json");
  try {
    const result = await run(
      executable,
      ["export", "--output", path, "--accept-source-agreements"],
      { inherit: false },
    );
    if (result.code !== 0) {
      throw new Error(
        `winget export failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
      );
    }
    const content = await readFile(path, "utf8");
    return parseWingetExport(content);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function captureBrew(
  executable: string,
  run: typeof runCommand,
): Promise<ReturnType<typeof parseBrewfileManifest>> {
  const commands: ReadonlyArray<ReadonlyArray<string>> = [["tap"], ["leaves"], ["list", "--cask"]];
  const results = await Promise.all(
    commands.map((args) => run(executable, args, { inherit: false })),
  );
  const labels = ["brew tap", "brew leaves", "brew list --cask"];
  for (const [index, result] of results.entries()) {
    if (result.code !== 0) {
      throw new Error(
        `${labels[index]} failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
      );
    }
  }
  return {
    taps: lines(results[0]?.stdout ?? ""),
    formulae: lines(results[1]?.stdout ?? ""),
    casks: lines(results[2]?.stdout ?? ""),
  };
}

function lines(content: string): string[] {
  return [
    ...new Set(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ].toSorted((left, right) => left.localeCompare(right, "en"));
}

function uniqueNames(values: ReadonlyArray<string>): string[] {
  const names = new Map<string, string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (!names.has(key)) {
      names.set(key, value);
    }
  }
  return [...names.values()];
}

async function compareBrewSection(context: DiffContext): Promise<DiffSection> {
  const executable = await context.which("brew");
  if (executable === undefined) {
    return unavailableSection("brew", "Homebrew is not installed or not in PATH.");
  }
  const manifest = await fetchManifest({
    path: BREWFILE_MANIFEST_PATH,
    config: context.config,
    fetcher: context.fetcher,
    offline: context.offline,
  });
  const desired = parseBrewfileManifest(manifest.text);
  const actual = await captureBrew(executable, context.run);
  return compareBrew(desired, actual);
}

async function compareWindowsSection(
  options: WindowsDiffOptions,
  context: DiffContext,
): Promise<DiffSection> {
  const routes = resolveWindowsRoutes(context.config.windows);
  const currentLock = await readWindowsLock(context.config);
  const selectedProfiles = resolveWindowsProfiles(
    options.profiles,
    currentLock.profiles,
    routes.defaultProfiles,
  );

  if (options.manager === "winget") {
    const executable = await context.which("winget");
    if (executable === undefined) {
      return unavailableSection("winget", "WinGet is not installed or not in PATH.");
    }
    const desired: string[] = [];
    for (const profile of selectedProfiles) {
      const manifest = await fetchManifest({
        path: routes.wingetProfilePath.replaceAll("{profile}", profile),
        config: context.config,
        fetcher: context.fetcher,
        offline: context.offline,
      });
      desired.push(...parseWindowsPackageList(manifest.text, manifest.path));
    }
    const actual = await captureWingetPackages(executable, context.run);
    return compareSets(
      "winget",
      uniqueNames(desired).map((name) => ({ name })),
      actual.map((name) => ({ name })),
    );
  }

  if (options.manager === "scoop") {
    const executable = await context.which("scoop");
    if (executable === undefined) {
      return unavailableSection("scoop", "Scoop is not installed or not in PATH.");
    }
    const manifest = await fetchManifest({
      path: routes.scoopPath,
      config: context.config,
      fetcher: context.fetcher,
      offline: context.offline,
    });
    const desired = parseScoopManifest(manifest.text);
    const actualResult = await runScoopCommand(context.run, executable, ["export"], {
      inherit: false,
    });
    if (actualResult.code !== 0) {
      throw new Error(
        `scoop export failed (exit ${actualResult.code}): ${actualResult.stderr || actualResult.stdout}`.trim(),
      );
    }
    return compareScoop(desired, parseScoopExport(actualResult.stdout));
  }

  throw new Error(`Unsupported Windows diff manager: ${options.manager}`);
}

function nixDryRunDiff(output: string): DiffSection {
  const plan = output.trim();
  const hasBuildPlan =
    /(?:will|would) be (?:built|fetched|substituted)|these (?:derivations|paths) will be built|building ['"]?/i.test(
      plan,
    );
  const section = emptySection(
    "nix",
    hasBuildPlan
      ? "The configured system would rebuild from the current repository state."
      : "The configured Nix system has no pending build plan.",
  );
  section.status = hasBuildPlan ? "different" : "same";
  return section;
}

const quietConsole = Object.assign(Object.create(console), {
  log: () => undefined,
}) as Console.Console;

async function compareNixSection(context: DiffContext): Promise<DiffSection> {
  if (context.offline) {
    return unavailableSection(
      "nix",
      "Nix comparison requires the canonical remote lock and is unavailable offline.",
    );
  }
  const executable = await context.which("nix");
  if (executable === undefined) {
    return unavailableSection("nix", "Nix is not installed or not in PATH.");
  }

  let repo: OutfittingRepo;
  try {
    repo = await resolveOutfittingRepo({ config: context.config });
  } catch (cause) {
    return unavailableSection("nix", errorMessage(cause));
  }

  const lock = await openNixLock(context.config, (options) =>
    pullLockfile(options).pipe(Effect.provideService(Console.Console, quietConsole)),
  );
  try {
    const output = await dryRunNixSystem({
      repo,
      lockPath: lock.lockPath,
      run: (command, args, options) => context.run(executable, args, options),
    });
    return nixDryRunDiff(output);
  } finally {
    await closeNixLock(lock.lockDir);
  }
}

function selectedManagers(platform: DiffPlatform, requested: string | undefined): DiffManager[] {
  const allowed = platform === "macos" ? MACOS_MANAGERS : WINDOWS_MANAGERS;
  if (requested === undefined || requested === "all") {
    return [...allowed];
  }
  const manager = requested.toLowerCase() as DiffManager;
  if (!allowed.includes(manager as never)) {
    throw new Error(
      `Unknown ${platform} diff manager "${requested}". Choose: ${allowed.join(", ")}, or all.`,
    );
  }
  return [manager];
}

export async function collectDiff(options: CollectDiffOptions): Promise<PlatformDiff> {
  const config = options.config ?? (await loadConfig());
  const context: DiffContext = {
    config,
    run: options.run ?? runCommand,
    which: options.which ?? which,
    fetcher: options.fetcher,
    offline: options.offline === true,
  };
  const sections: DiffSection[] = [];

  for (const manager of selectedManagers(options.platform, options.manager)) {
    try {
      if (options.platform === "macos" && manager === "brew") {
        sections.push(await compareBrewSection(context));
      } else if (options.platform === "macos" && manager === "nix") {
        sections.push(await compareNixSection(context));
      } else if (options.platform === "windows") {
        sections.push(
          await compareWindowsSection(
            {
              manager: manager as Extract<DiffManager, "winget" | "scoop">,
              profiles: options.profiles,
            },
            context,
          ),
        );
      }
    } catch (cause) {
      sections.push(unavailableSection(manager, errorMessage(cause)));
    }
  }

  return {
    platform: options.platform,
    source: `${config.manifest.baseUrl}/${config.manifest.ref}`,
    sections,
    differences: sections.some((section) => section.status === "different"),
    unavailable: sections.some((section) => section.status === "unavailable"),
  };
}
