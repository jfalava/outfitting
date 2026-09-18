import { Console, Effect, Option } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { loadConfig, resolveWindowsRoutes, type ManagerConfig } from "@/config";
import { CliFailure } from "@/errors";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which } from "@/process";
import { ui } from "@/ui";
import { parseScoopManifest, updateScoop, type ScoopManifest } from "@/update/scoop";
import { runScoopCommand } from "@/update/scoop-command";
import {
  isWingetAlreadyInstalledExitCode,
  readWindowsLock,
  recordWindowsOperation,
  WINDOWS_LOCK_KIND,
  wingetIdentity,
  wingetSource,
  writeWindowsLock,
  type WindowsLock,
  type WindowsPackageRecord,
} from "@/update/windows-lock";
import { wingetPackageArgs } from "@/update/winget";

/** Profiles shipped by the default repository; compatible repositories may add their own. */
export const WINDOWS_PROFILE_NAMES = ["base", "dev", "gaming", "network", "qol", "work"] as const;

export function windowsWingetProfilePath(config: ManagerConfig, profile: string): string {
  return resolveWindowsRoutes(config.windows).wingetProfilePath.replaceAll("{profile}", profile);
}

export function windowsPowerShellProfilePath(config: ManagerConfig): string {
  return resolveWindowsRoutes(config.windows).powershellProfilePath;
}

export interface WindowsSyncOptions<ConfirmR = never> {
  config?: ManagerConfig;
  profiles?: ReadonlyArray<string>;
  /** Allow bootstrap installers to reconcile WinGet before Scoop exists. */
  wingetOnly?: boolean;
  noPush?: boolean;
  fetcher?: ManifestFetcher;
  run?: typeof runCommand;
  which?: typeof which;
  /** Override the confirmation response for clean operations. */
  confirmClean?: Effect.Effect<boolean, never, ConfirmR>;
}

export interface WindowsWingetPackage {
  name: string;
  source?: "msstore";
}

/** Parse a line-oriented package manifest without allowing command fragments. */
export function parseWindowsPackageList(content: string, path: string): WindowsWingetPackage[] {
  const packages: WindowsWingetPackage[] = [];
  const seen = new Set<string>();
  const invalid: string[] = [];
  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    const value = raw.trim();
    if (value.length === 0 || value.startsWith("#")) {
      continue;
    }
    const isStore = /^msstore:/i.test(value);
    const name = isStore ? value.slice("msstore:".length) : value;
    if (!/^(?!-)[^\s:]+$/.test(name)) {
      invalid.push(`line ${index + 1}: ${value}`);
      continue;
    }
    const source = isStore ? "msstore" : undefined;
    const key = wingetIdentity(name, source);
    if (!seen.has(key)) {
      seen.add(key);
      packages.push(source === undefined ? { name } : { name, source });
    }
  }
  if (invalid.length > 0) {
    throw new Error(`Invalid WinGet manifest entries in ${path}: ${invalid.join("; ")}`);
  }
  if (packages.length === 0) {
    throw new Error(`The WinGet manifest ${path} contains no packages.`);
  }
  return packages;
}

export function resolveWindowsProfiles(
  requested: ReadonlyArray<string> | undefined,
  previous: ReadonlyArray<string>,
  defaults: ReadonlyArray<string> = ["base"],
): string[] {
  const profiles =
    requested === undefined || requested.length === 0
      ? previous.length > 0
        ? [...previous]
        : [...defaults]
      : requested;
  const normalized = [
    ...new Set(profiles.flatMap((profile) => profile.split(",")).map((profile) => profile.trim())),
  ].filter((profile) => profile.length > 0);
  const invalid = normalized.filter((profile) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile));
  if (invalid.length > 0) {
    throw new Error(`Invalid Windows profile name(s): ${invalid.join(", ")}.`);
  }
  if (normalized.length === 0) {
    throw new Error("At least one Windows profile must be selected.");
  }
  const regular = normalized.filter((profile) => !/^msstore-/i.test(profile));
  const unpaired = normalized.filter(
    (profile) => /^msstore-/i.test(profile) && !regular.includes(profile.slice("msstore-".length)),
  );
  if (unpaired.length > 0) {
    throw new Error(
      `Store-only profiles have been removed: ${unpaired.join(", ")}. Select regular profiles explicitly with --profile (for example, --profile base). Regular profiles also install non-Store packages.`,
    );
  }
  return regular;
}

function packageName(value: string): string {
  return value.split("/").at(-1) ?? value;
}

function baselineWingetRecords(
  packages: ReadonlyArray<WindowsWingetPackage>,
): WindowsPackageRecord[] {
  return packages.map((packageInfo) => ({
    name: packageInfo.name,
    args: wingetPackageArgs("install", packageInfo.name, packageInfo.source ?? "winget"),
    origin: "baseline",
  }));
}

function baselineScoopRecords(names: ReadonlyArray<string>): WindowsPackageRecord[] {
  return names.map((name) => ({ name, args: [], origin: "baseline" }));
}

interface CleanPackage {
  manager: "WinGet" | "Scoop";
  name: string;
}

function cleanCandidates(
  current: WindowsLock,
  desiredWinget: ReadonlyArray<WindowsWingetPackage>,
  desiredScoop: ScoopManifest | undefined,
): CleanPackage[] {
  const desiredWingetNames = new Set(
    desiredWinget.map((packageInfo) => wingetIdentity(packageInfo.name, packageInfo.source)),
  );
  const desiredScoopNames = new Set(
    (desiredScoop?.packages ?? []).map((spec) => packageName(spec).toLowerCase()),
  );
  return [
    ...current.packages.winget
      .filter(
        (record) => !desiredWingetNames.has(wingetIdentity(record.name, wingetSource(record.args))),
      )
      .map((record) => ({
        manager: "WinGet" as const,
        name: `${wingetSource(record.args)}:${record.name}`,
      })),
    ...current.packages.scoop
      .filter((record) => !desiredScoopNames.has(record.name.toLowerCase()))
      .map((record) => ({ manager: "Scoop" as const, name: record.name })),
  ];
}

const confirmCleanPlan = Effect.fn("confirmCleanPlan")(function* <ConfirmR>(
  removals: ReadonlyArray<CleanPackage>,
  confirmation: Effect.Effect<boolean, never, ConfirmR> | undefined,
) {
  if (removals.length === 0) {
    yield* Console.log(ui.muted("No tracked packages will be removed."));
    return true;
  }

  yield* Console.log(ui.heading("Packages to be removed:"));
  for (const removal of removals) {
    yield* Console.log(`  ${removal.manager}: ${removal.name}`);
  }
  if (confirmation === undefined) {
    return yield* new CliFailure({
      message: "A confirmation effect is required when sync would remove packages.",
    });
  }
  const confirmed = yield* confirmation;
  if (!confirmed) {
    yield* Console.log(ui.muted("Aborted. No packages were removed."));
  }
  return confirmed;
});

function replaceManagedRecords(
  lock: WindowsLock,
  manager: "winget" | "scoop",
  desired: ReadonlyArray<WindowsPackageRecord>,
): void {
  lock.packages[manager] = desired.toSorted((left, right) => left.name.localeCompare(right.name));
}

interface WingetRunContext {
  run: typeof runCommand;
  executable: string;
  action: "install" | "uninstall";
  name: string;
  source?: "winget" | "msstore";
}

function runWinget({ run, executable, action, name, source }: WingetRunContext) {
  const args = wingetPackageArgs(action, name, source ?? "winget");
  return Effect.gen(function* () {
    const result = yield* tryPromise(() => run(executable, args, { inherit: true }));
    const alreadyInstalled = action === "install" && isWingetAlreadyInstalledExitCode(result.code);
    if (result.code !== 0 && !alreadyInstalled) {
      return yield* new CliFailure({
        message: `winget ${action} ${name} failed (exit ${result.code}).`,
      });
    }
    if (alreadyInstalled) {
      yield* Console.log(ui.muted(`WinGet package already installed and up to date: ${name}`));
    }
    return { args, exitCode: result.code };
  });
}

const fetchWingetPackages = Effect.fn("fetchWingetPackages")(function* (
  config: ManagerConfig,
  profiles: ReadonlyArray<string>,
  fetcher: ManifestFetcher | undefined,
) {
  const packages: WindowsWingetPackage[] = [];
  for (const profile of profiles) {
    const manifest = yield* tryPromise(() =>
      fetchManifest({
        path: windowsWingetProfilePath(config, profile),
        config,
        fetcher,
      }),
    );
    if (manifest.warning) {
      yield* Console.log(ui.muted(manifest.warning));
    }
    const entries = yield* Effect.try({
      try: () => parseWindowsPackageList(manifest.text, manifest.path),
      catch: (cause) =>
        new CliFailure({ message: cause instanceof Error ? cause.message : String(cause) }),
    });
    packages.push(...entries);
  }
  return [
    ...new Map(
      packages.map((packageInfo) => [
        wingetIdentity(packageInfo.name, packageInfo.source),
        packageInfo,
      ]),
    ).values(),
  ];
});

const fetchWindowsProfile = Effect.fn("fetchWindowsProfile")(function* (
  config: ManagerConfig,
  fetcher: ManifestFetcher | undefined,
) {
  const manifest = yield* tryPromise(() =>
    fetchManifest({
      path: windowsPowerShellProfilePath(config),
      config,
      materialize: true,
      fetcher,
    }),
  );
  if (manifest.warning) {
    yield* Console.log(ui.muted(manifest.warning));
  }
  return manifest;
});

const installWingetPackages = Effect.fn("installWingetPackages")(function* (
  config: ManagerConfig,
  run: typeof runCommand,
  executable: string,
  packages: ReadonlyArray<WindowsWingetPackage>,
) {
  for (const packageInfo of packages) {
    const { args, exitCode } = yield* runWinget({
      run,
      executable,
      action: "install",
      name: packageInfo.name,
      source: packageInfo.source,
    });
    yield* tryPromise(() =>
      recordWindowsOperation({
        config,
        manager: "winget",
        action: "install",
        name: packageInfo.name,
        args,
        status: "success",
        exitCode,
      }),
    );
  }
});

interface CleanWingetContext {
  config: ManagerConfig;
  run: typeof runCommand;
  executable: string;
  current: WindowsLock;
  desired: ReadonlyArray<WindowsWingetPackage>;
}

const cleanWingetPackages = Effect.fn("cleanWingetPackages")(function* ({
  config,
  run,
  executable,
  current,
  desired,
}: CleanWingetContext) {
  const desiredNames = new Set(
    desired.map((packageInfo) => wingetIdentity(packageInfo.name, packageInfo.source)),
  );
  for (const packageRecord of current.packages.winget) {
    if (desiredNames.has(wingetIdentity(packageRecord.name, wingetSource(packageRecord.args)))) {
      continue;
    }
    const { args } = yield* runWinget({
      run,
      executable,
      action: "uninstall",
      name: packageRecord.name,
      source: wingetSource(packageRecord.args),
    });
    yield* tryPromise(() =>
      recordWindowsOperation({
        config,
        manager: "winget",
        action: "uninstall",
        name: packageRecord.name,
        args,
        status: "success",
        exitCode: 0,
      }),
    );
  }
});

interface CleanScoopContext {
  config: ManagerConfig;
  run: typeof runCommand;
  executable: string;
  current: WindowsLock;
  desired: ReadonlyArray<string>;
}

const cleanScoopPackages = Effect.fn("cleanScoopPackages")(function* ({
  config,
  run,
  executable,
  current,
  desired,
}: CleanScoopContext) {
  const desiredNames = new Set(desired.map((name) => name.toLowerCase()));
  for (const packageRecord of current.packages.scoop) {
    if (desiredNames.has(packageRecord.name.toLowerCase())) {
      continue;
    }
    const args = ["uninstall", packageRecord.name];
    const result = yield* tryPromise(() =>
      runScoopCommand(run, executable, args, { inherit: true }),
    );
    if (result.code !== 0) {
      return yield* new CliFailure({
        message: `scoop uninstall ${packageRecord.name} failed (exit ${result.code}).`,
      });
    }
    yield* tryPromise(() =>
      recordWindowsOperation({
        config,
        manager: "scoop",
        action: "uninstall",
        name: packageRecord.name,
        args,
        status: "success",
        exitCode: 0,
      }),
    );
  }
});

const fetchScoop = Effect.fn("fetchScoop")(function* (
  config: ManagerConfig,
  fetcher: ManifestFetcher | undefined,
) {
  const manifest = yield* tryPromise(() =>
    fetchManifest({
      path: resolveWindowsRoutes(config.windows).scoopPath,
      config,
      materialize: true,
      fetcher,
    }),
  );
  if (manifest.warning) {
    yield* Console.log(ui.muted(manifest.warning));
  }
  return yield* Effect.try({
    try: () => parseScoopManifest(manifest.text),
    catch: (cause) =>
      new CliFailure({ message: cause instanceof Error ? cause.message : String(cause) }),
  });
});

const prepareScoop = Effect.fn("prepareScoop")(function* (
  config: ManagerConfig,
  fetcher: ManifestFetcher | undefined,
  whichFn: typeof which,
  wingetOnly: boolean,
) {
  const path = yield* tryPromise(() => whichFn("scoop"));
  if (path === undefined) {
    if (!wingetOnly) {
      return yield* new CliFailure({ message: "scoop is not installed or not in PATH." });
    }
    yield* Console.log(ui.muted("Scoop is not installed; skipping Scoop until post-install."));
    return { path: undefined, manifest: undefined };
  }
  return { path, manifest: yield* fetchScoop(config, fetcher) };
});

interface SyncScoopContext {
  config: ManagerConfig;
  current: WindowsLock;
  manifest: ScoopManifest;
  run: typeof runCommand;
  scoopPath: string;
}

const syncScoopPackages = Effect.fn("syncScoopPackages")(function* ({
  config,
  current,
  manifest,
  run,
  scoopPath,
}: SyncScoopContext) {
  yield* updateScoop({
    config,
    manifest,
    noSync: true,
    run,
    which: async () => scoopPath,
    scoopPath,
  });
  yield* cleanScoopPackages({
    config,
    run,
    executable: scoopPath,
    current,
    desired: manifest.packages.map(packageName),
  });
  return manifest;
});

export const syncWindows = <ConfirmR = never>(options: WindowsSyncOptions<ConfirmR> = {}) =>
  Effect.gen(function* () {
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const current = yield* tryPromise(() => readWindowsLock(config));
    const profiles = yield* Effect.try({
      try: () =>
        resolveWindowsProfiles(
          options.profiles,
          current.profiles,
          resolveWindowsRoutes(config.windows).defaultProfiles,
        ),
      catch: (cause) =>
        new CliFailure({ message: cause instanceof Error ? cause.message : String(cause) }),
    });
    const run = options.run ?? runCommand;
    const whichFn = options.which ?? which;
    const fetcher = options.fetcher;
    yield* fetchWindowsProfile(config, fetcher);
    const wingetPath = yield* tryPromise(() => whichFn("winget"));
    if (wingetPath === undefined) {
      return yield* new CliFailure({ message: "winget is not installed or not in PATH." });
    }

    const uniqueWingetPackages = yield* fetchWingetPackages(config, profiles, fetcher);

    const { path: scoopPath, manifest: scoopManifest } = yield* prepareScoop(
      config,
      fetcher,
      whichFn,
      options.wingetOnly === true,
    );
    const cleanConfirmed = yield* confirmCleanPlan(
      cleanCandidates(current, uniqueWingetPackages, scoopManifest),
      options.confirmClean,
    );
    if (!cleanConfirmed) {
      return;
    }

    yield* Console.log(ui.heading(`Syncing Windows profiles: ${profiles.join(", ")}…`));
    yield* installWingetPackages(config, run, wingetPath, uniqueWingetPackages);

    yield* cleanWingetPackages({
      config,
      run,
      executable: wingetPath,
      current,
      desired: uniqueWingetPackages,
    });

    const scoop =
      scoopPath === undefined || scoopManifest === undefined
        ? undefined
        : yield* syncScoopPackages({
            config,
            current,
            manifest: scoopManifest,
            run,
            scoopPath,
          });

    const updated = yield* tryPromise(() => readWindowsLock(config));
    replaceManagedRecords(updated, "winget", baselineWingetRecords(uniqueWingetPackages));
    if (scoop !== undefined) {
      replaceManagedRecords(
        updated,
        "scoop",
        baselineScoopRecords(scoop.packages.map(packageName)),
      );
    }
    updated.profiles = profiles;
    const path = yield* tryPromise(() => writeWindowsLock(updated, { root: config.stateRoot }));

    if (options.noPush) {
      yield* Console.log(ui.muted("Skipped Worker sync (--no-push)."));
    } else {
      yield* pushLockfile({ machine: config.machineId, kind: WINDOWS_LOCK_KIND, path });
    }
    yield* Console.log(ui.success("Windows packages and windows.lock.json are synchronized."));
  });

const profileFlag = Flag.String("profile").pipe(
  Flag.optional,
  Flag.withDescription(
    "Comma-separated regular profiles from the configured repository, including their Store packages.",
  ),
);

export const windowsSyncCommand = Command.make(
  "sync",
  {
    profile: profileFlag,
    wingetOnly: Flag.Boolean("winget-only").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip Scoop while bootstrapping WinGet on a fresh machine."),
    ),
    noPush: Flag.Boolean("no-push").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Write the local lockfile without pushing it to the Worker."),
    ),
  },
  ({ profile, wingetOnly, noPush }) =>
    syncWindows({
      profiles: Option.isSome(profile) ? [profile.value] : undefined,
      wingetOnly,
      noPush,
      confirmClean: Prompt.Confirm({ message: "Remove the listed packages?", initial: false }).pipe(
        Effect.orDie,
      ),
    }),
).pipe(
  Command.withDescription(
    "Pull Windows package manifests, reconcile winget and Scoop, and update windows.lock.json.",
  ),
);
