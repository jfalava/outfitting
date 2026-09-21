import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Console, Effect, Option, Schema } from "effect";

import { parseWindowsPackageList, resolveWindowsProfiles } from "@/commands/windows-apply";
import {
  DEFAULT_LINUX_PROFILE,
  loadConfig,
  resolveOutfittingRepo,
  resolveWindowsRoutes,
  type ManagerConfig,
  type OutfittingRepo,
} from "@/config";
import type { DiffManager, DiffPlatform, DiffSection, PlatformDiff } from "@/diff/types";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { pullLockfile } from "@/lockfiles";
import type { LinuxPackageManager } from "@/platform/linux";
import { runCommand, which } from "@/process";
import { parseBrewfileManifest, BREWFILE_MANIFEST_PATH } from "@/update/brew";
import {
  isLinuxProfile,
  listInstalledLinuxPackages,
  missingLinuxPackages,
  parseLinuxPackageManifest,
  type LinuxProfile,
} from "@/update/linux";
import { prepareLinuxSource, readLinuxManifest, type LinuxSource } from "@/update/linux-source";
import { closeNixLock, openNixLock } from "@/update/nix/lock";
import { NIX_SYSTEM_ATTR } from "@/update/nix/types";
import { parseScoopManifest, type ScoopManifest } from "@/update/scoop";
import { runScoopCommand } from "@/update/scoop-command";
import { readWindowsLock } from "@/update/windows-lock";
import { parseScoopExport, type ScoopExportState } from "@/update/windows-snapshot";

const MACOS_MANAGERS = ["brew", "nix"] as const satisfies ReadonlyArray<DiffManager>;
const WINDOWS_MANAGERS = ["winget", "scoop"] as const satisfies ReadonlyArray<DiffManager>;
const LINUX_MANAGERS = ["apt", "pacman"] as const satisfies ReadonlyArray<DiffManager>;

export interface CollectDiffOptions {
  platform: DiffPlatform;
  manager?: string;
  profiles?: ReadonlyArray<string>;
  offline?: boolean;
  refresh?: boolean;
  config?: ManagerConfig;
  fetcher?: ManifestFetcher;
  run?: typeof runCommand;
  which?: typeof which;
  onProgress?: (progress: DiffProgress) => void;
}

export interface DiffProgress {
  completed: number;
  total: number;
  manager: DiffManager;
  phase: "started" | "item" | "completed";
  item?: string;
  itemIndex?: number;
  itemTotal?: number;
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
  warnings: string[];
  reportItem: (item: string, itemIndex: number, itemTotal: number) => void;
  linuxSource?: LinuxSource;
}

interface WindowsDiffOptions {
  manager: Extract<DiffManager, "winget" | "scoop">;
  profiles: ReadonlyArray<string> | undefined;
}

interface LinuxDiffOptions {
  manager: Extract<DiffManager, "apt" | "pacman">;
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

function unavailableSection(manager: DiffManager, message: string): DiffSection {
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
  onItem?: DiffContext["reportItem"],
): DiffSection {
  const desiredMap = new Map(desired.map((item) => [item.name.toLowerCase(), item]));
  const actualMap = new Map(actual.map((item) => [item.name.toLowerCase(), item]));
  const missing: string[] = [];
  const extra: string[] = [];
  const changed: string[] = [];
  const keys = new Set([...desiredMap.keys(), ...actualMap.keys()]);
  let itemIndex = 0;

  for (const key of keys) {
    const item = desiredMap.get(key) ?? actualMap.get(key);
    if (item === undefined) {
      continue;
    }
    const current = actualMap.get(key);
    if (current === undefined) {
      missing.push(item.name);
    } else if (item.value !== undefined && item.value !== current.value) {
      changed.push(`${item.name}: ${current.value} → ${item.value}`);
    }
    if (desiredMap.get(key) === undefined) {
      extra.push(item.name);
    }
    itemIndex += 1;
    onItem?.(item.name, itemIndex, keys.size);
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
  onItem?: DiffContext["reportItem"],
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
    onItem,
  );
  result.message =
    "Checks all installed formulae for required packages; only explicitly installed formulae count as extras.";
  return result;
}

function compareScoop(
  desired: ScoopManifest,
  actual: ScoopExportState,
  onItem?: DiffContext["reportItem"],
): DiffSection {
  const desiredBuckets = desired.buckets.map((bucket) => ({
    name: `bucket: ${bucket.name}`,
    value: bucket.url,
  }));
  const actualBuckets = actual.buckets.map((bucket) => ({
    name: `bucket: ${bucket.Name}`,
    value: bucket.Source,
  }));
  const desiredPackages = desired.packages.map((spec) => ({
    name: `package: ${packageName(spec)}`,
  }));
  const actualPackages = actual.apps
    .filter((app) => !/\bGlobal install\b/i.test(app.Info))
    .map((app) => ({ name: `package: ${app.Name}` }));
  return compareSets(
    "scoop",
    [...desiredBuckets, ...desiredPackages],
    [...actualBuckets, ...actualPackages],
    onItem,
  );
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
      SourceDetails: Schema.optionalKey(Schema.Struct({ Name: Schema.String })),
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
        source.Packages.map((pkg) =>
          source.SourceDetails?.Name.toLowerCase() === "msstore"
            ? `msstore:${pkg.PackageIdentifier}`
            : pkg.PackageIdentifier,
        ),
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
  desiredFormulae: ReadonlyArray<string>,
): Promise<ReturnType<typeof parseBrewfileManifest>> {
  async function capture(args: ReadonlyArray<string>): Promise<string[]> {
    const result = await run(executable, args, { inherit: false });
    if (result.code !== 0) {
      throw new Error(
        `brew ${args.join(" ")} failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
      );
    }
    return lines(result.stdout);
  }
  const [taps, formulae, casks, requested] = await Promise.all([
    capture(["tap"]),
    capture(["list", "--formula"]),
    capture(["list", "--cask"]),
    capture(["list", "--formula", "--installed-on-request"]),
  ]);
  const relevantFormulae = new Set(
    [...desiredFormulae, ...requested].map((name) => name.toLowerCase()),
  );
  return {
    taps,
    formulae: formulae.filter((name) => relevantFormulae.has(name.toLowerCase())),
    casks,
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

async function fetchDiffManifest(path: string, context: DiffContext): Promise<string> {
  const manifest = await fetchManifest({
    path,
    config: context.config,
    fetcher: context.fetcher,
    offline: context.offline,
  });
  if (manifest.source === "cache" && !context.offline) {
    throw new Error(
      `${manifest.warning} Fresh repository state could not be verified. Use --offline to compare cached manifests explicitly.`,
    );
  }
  if (manifest.warning !== undefined) {
    context.warnings.push(manifest.warning);
  }
  return manifest.text;
}

async function compareBrewSection(context: DiffContext): Promise<DiffSection> {
  const executable = await context.which("brew");
  if (executable === undefined) {
    return unavailableSection("brew", "Homebrew is not installed or not in PATH.");
  }
  const desired = parseBrewfileManifest(await fetchDiffManifest(BREWFILE_MANIFEST_PATH, context));
  const actual = await captureBrew(executable, context.run, desired.formulae);
  return compareBrew(desired, actual, context.reportItem);
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
      const path = routes.wingetProfilePath.replaceAll("{profile}", profile);
      desired.push(
        ...parseWindowsPackageList(await fetchDiffManifest(path, context), path).map(
          (packageInfo) =>
            packageInfo.source === "msstore" ? `msstore:${packageInfo.name}` : packageInfo.name,
        ),
      );
    }
    const actual = await captureWingetPackages(executable, context.run);
    return compareSets(
      "winget",
      desired.map((name) => ({ name })),
      actual.map((name) => ({ name })),
      context.reportItem,
    );
  }

  if (options.manager === "scoop") {
    const executable = await context.which("scoop");
    if (executable === undefined) {
      return unavailableSection("scoop", "Scoop is not installed or not in PATH.");
    }
    const desired = parseScoopManifest(await fetchDiffManifest(routes.scoopPath, context));
    const actualResult = await runScoopCommand(context.run, executable, ["export"], {
      inherit: false,
    });
    if (actualResult.code !== 0) {
      throw new Error(
        `scoop export failed (exit ${actualResult.code}): ${actualResult.stderr || actualResult.stdout}`.trim(),
      );
    }
    return compareScoop(desired, parseScoopExport(actualResult.stdout), context.reportItem);
  }

  throw new Error(`Unsupported Windows diff manager: ${options.manager}`);
}

function resolveLinuxDiffProfile(
  profiles: ReadonlyArray<string> | undefined,
  config: ManagerConfig,
): LinuxProfile {
  if (profiles !== undefined && profiles.length !== 1) {
    throw new Error("Linux diff accepts one profile at a time.");
  }
  const profile = profiles?.[0] ?? config.linux?.profile ?? DEFAULT_LINUX_PROFILE;
  if (!isLinuxProfile(profile)) {
    throw new Error(`Unknown Linux profile \`${profile}\`.`);
  }
  return profile;
}

async function compareLinuxSection(
  options: LinuxDiffOptions,
  context: DiffContext,
): Promise<DiffSection> {
  const profile = resolveLinuxDiffProfile(options.profiles, context.config);

  const manager = options.manager satisfies LinuxPackageManager;
  const executable = await context.which(manager);
  if (executable === undefined) {
    return unavailableSection(manager, `${manager} is not installed or not in PATH.`);
  }

  const desired = parseLinuxPackageManifest(
    await readLinuxManifest(context.config, profile, context.linuxSource?.root, manager),
  );
  const installed = await listInstalledLinuxPackages(manager, {
    run: context.run,
    which: context.which,
  });
  const missing = missingLinuxPackages(desired, installed);
  for (const [index, declaredPackage] of desired.entries()) {
    context.reportItem(declaredPackage, index + 1, desired.length);
  }

  return {
    manager,
    status: missing.length === 0 ? "same" : "different",
    missing,
    extra: [],
    changed: [],
    message: `Checks only declared ${manager} packages; unrelated installed packages are ignored.`,
  };
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
    context.reportItem("system", 1, 1);
    const active = await realpath("/run/current-system");
    const env: NodeJS.ProcessEnv = { ...process.env, OUTFITTING_REPO: repo.root };
    delete env.NIX_PATH;
    const result = await context.run(
      executable,
      [
        "eval",
        "--raw",
        "--impure",
        "--reference-lock-file",
        lock.lockPath,
        "--no-write-lock-file",
        `path:${repo.flakePath}#${repo.systemAttr.length > 0 ? repo.systemAttr : NIX_SYSTEM_ATTR}.outPath`,
      ],
      { inherit: false, env },
    );
    if (result.code !== 0) {
      throw new Error(
        `nix eval failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
      );
    }
    const desired = result.stdout.trim();
    if (desired.length === 0) {
      throw new Error("nix eval succeeded but printed no system output path.");
    }
    return {
      manager: "nix",
      status: active === desired ? "same" : "different",
      missing: [],
      extra: [],
      changed: active === desired ? [] : [`system: ${active} → ${desired}`],
      message: `Compares /run/current-system with ${repo.flakePath} using the canonical remote lock.`,
    };
  } finally {
    await closeNixLock(lock.lockDir);
  }
}

function selectedManagers(platform: DiffPlatform, requested: string | undefined): DiffManager[] {
  const allowed =
    platform === "macos"
      ? MACOS_MANAGERS
      : platform === "windows"
        ? WINDOWS_MANAGERS
        : LINUX_MANAGERS;
  if (requested === undefined || requested === "all") {
    return platform === "linux" ? ["apt"] : [...allowed];
  }
  const manager = allowed.find((candidate) => candidate === requested.toLowerCase());
  if (manager === undefined) {
    throw new Error(
      `Unknown ${platform} diff manager "${requested}". Choose: ${allowed.join(", ")}, or all.`,
    );
  }
  return [manager];
}

async function compareSection(
  manager: DiffManager,
  profiles: ReadonlyArray<string> | undefined,
  context: DiffContext,
): Promise<DiffSection> {
  if (manager === "brew") {
    return compareBrewSection(context);
  }
  if (manager === "nix") {
    return compareNixSection(context);
  }
  if (manager === "winget" || manager === "scoop") {
    return compareWindowsSection({ manager, profiles }, context);
  }
  return compareLinuxSection({ manager, profiles }, context);
}

async function resolveLinuxDiffSource(
  options: CollectDiffOptions,
  config: ManagerConfig,
): Promise<LinuxSource | undefined> {
  if (options.platform !== "linux" || options.refresh !== true) {
    return undefined;
  }
  const profile = resolveLinuxDiffProfile(options.profiles, config);
  return prepareLinuxSource({
    config,
    profile,
    refresh: true,
    offline: options.offline,
    fetcher: options.fetcher,
  });
}

export async function collectDiff(options: CollectDiffOptions): Promise<PlatformDiff> {
  const config = options.config ?? (await loadConfig());
  const linuxSource = await resolveLinuxDiffSource(options, config);
  const context: DiffContext = {
    config,
    run: options.run ?? runCommand,
    which: options.which ?? which,
    fetcher: options.fetcher,
    offline: options.offline === true,
    warnings: [],
    reportItem: () => undefined,
    linuxSource,
  };
  const sections: DiffSection[] = [];
  const managers = selectedManagers(options.platform, options.manager);

  for (const manager of managers) {
    context.warnings = [];
    context.reportItem = (item, itemIndex, itemTotal) =>
      options.onProgress?.({
        completed: sections.length,
        total: managers.length,
        manager,
        phase: "item",
        item,
        itemIndex,
        itemTotal,
      });
    options.onProgress?.({
      completed: sections.length,
      total: managers.length,
      manager,
      phase: "started",
    });
    let section: DiffSection;
    try {
      section = await compareSection(manager, options.profiles, context);
    } catch (cause) {
      section = unavailableSection(manager, errorMessage(cause));
    }
    if (context.warnings.length > 0) {
      section.warnings = context.warnings;
    }
    sections.push(section);
    options.onProgress?.({
      completed: sections.length,
      total: managers.length,
      manager,
      phase: "completed",
    });
  }

  return {
    platform: options.platform,
    source: linuxSource?.root ?? `${config.manifest.baseUrl}/${config.manifest.ref}`,
    sections,
    differences: sections.some((section) => section.status === "different"),
    unavailable: sections.some((section) => section.status === "unavailable"),
  };
}
