import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { loadConfig, type ManagerConfig } from "@/config";
import { CliFailure } from "@/errors";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which } from "@/process";
import { ui } from "@/ui";
import { parseScoopManifest, SCOOP_MANIFEST_PATH, updateScoop } from "@/update/scoop";
import { runScoopCommand } from "@/update/scoop-command";
import {
  isWingetAlreadyInstalledExitCode,
  readWindowsLock,
  recordWindowsOperation,
  WINDOWS_LOCK_KIND,
  writeWindowsLock,
  type WindowsLock,
  type WindowsPackageRecord,
} from "@/update/windows-lock";

export const WINDOWS_PROFILE_NAMES = [
  "base",
  "dev",
  "gaming",
  "network",
  "qol",
  "work",
  "msstore-base",
  "msstore-dev",
  "msstore-gaming",
  "msstore-qol",
  "msstore-work",
] as const;

const WINGET_PROFILE_PATH = (profile: string) => `packages/windows/${profile}.txt`;
export const WINDOWS_PROFILE_PATH = "dotfiles/Microsoft.PowerShell_profile.ps1";

export interface WindowsSyncOptions {
  config?: ManagerConfig;
  profiles?: ReadonlyArray<string>;
  clean?: boolean;
  /** Allow bootstrap installers to reconcile WinGet before Scoop exists. */
  wingetOnly?: boolean;
  noPush?: boolean;
  fetcher?: ManifestFetcher;
  run?: typeof runCommand;
  which?: typeof which;
}

interface WindowsWingetPackage {
  name: string;
  source?: "msstore";
}

/** Parse a line-oriented package manifest without allowing command fragments. */
export function parseWindowsPackageList(content: string, path: string): string[] {
  const packages: string[] = [];
  const seen = new Set<string>();
  const invalid: string[] = [];
  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    const value = raw.trim();
    if (value.length === 0 || value.startsWith("#")) {
      continue;
    }
    if (/\s/.test(value) || value.startsWith("-")) {
      invalid.push(`line ${index + 1}: ${value}`);
      continue;
    }
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      packages.push(value);
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
): string[] {
  const profiles =
    requested === undefined || requested.length === 0
      ? previous.length > 0
        ? [...previous]
        : ["base"]
      : requested;
  const allowed = new Set<string>(WINDOWS_PROFILE_NAMES);
  const normalized = [
    ...new Set(profiles.flatMap((profile) => profile.split(",")).map((profile) => profile.trim())),
  ].filter((profile) => profile.length > 0);
  const invalid = normalized.filter((profile) => !allowed.has(profile));
  if (invalid.length > 0) {
    throw new Error(`Unknown Windows profile(s): ${invalid.join(", ")}.`);
  }
  return normalized;
}

function packageName(value: string): string {
  return value.split("/").at(-1) ?? value;
}

function baselineWingetRecords(
  packages: ReadonlyArray<WindowsWingetPackage>,
): WindowsPackageRecord[] {
  return packages.map((packageInfo) => ({
    name: packageInfo.name,
    args: wingetInstallArgs("install", packageInfo.name, packageInfo.source),
    origin: "baseline",
  }));
}

function baselineScoopRecords(names: ReadonlyArray<string>): WindowsPackageRecord[] {
  return names.map((name) => ({ name, args: [], origin: "baseline" }));
}

function replaceManagedRecords(
  lock: WindowsLock,
  manager: "winget" | "scoop",
  desired: ReadonlyArray<WindowsPackageRecord>,
  clean: boolean,
): void {
  const desiredNames = new Set(desired.map((record) => record.name.toLowerCase()));
  const manual = clean
    ? []
    : lock.packages[manager]
        .filter((record) => !desiredNames.has(record.name.toLowerCase()))
        .map((record) => ({ ...record, origin: "manual" as const }));
  lock.packages[manager] = [...manual, ...desired].toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function wingetInstallArgs(
  action: "install" | "uninstall",
  name: string,
  source?: "msstore",
): string[] {
  return [
    action,
    "--id",
    name,
    "--exact",
    ...(source === "msstore" ? ["--source", "msstore"] : []),
    "--accept-source-agreements",
    "--accept-package-agreements",
  ];
}

interface WingetRunContext {
  run: typeof runCommand;
  executable: string;
  action: "install" | "uninstall";
  name: string;
  source?: "msstore";
}

function runWinget({ run, executable, action, name, source }: WingetRunContext) {
  const args = wingetInstallArgs(action, name, source);
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
        path: WINGET_PROFILE_PATH(profile),
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
    for (const name of entries) {
      const packageInfo: WindowsWingetPackage = { name };
      if (profile.startsWith("msstore-")) {
        packageInfo.source = "msstore";
      }
      packages.push(packageInfo);
    }
  }
  return [
    ...new Map(
      packages.map((packageInfo) => [packageInfo.name.toLowerCase(), packageInfo]),
    ).values(),
  ];
});

const fetchWindowsProfile = Effect.fn("fetchWindowsProfile")(function* (
  config: ManagerConfig,
  fetcher: ManifestFetcher | undefined,
) {
  const manifest = yield* tryPromise(() =>
    fetchManifest({
      path: WINDOWS_PROFILE_PATH,
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
  const desiredNames = new Set(desired.map((packageInfo) => packageInfo.name.toLowerCase()));
  for (const packageRecord of current.packages.winget) {
    if (desiredNames.has(packageRecord.name.toLowerCase())) {
      continue;
    }
    const { args } = yield* runWinget({
      run,
      executable,
      action: "uninstall",
      name: packageRecord.name,
      source: packageRecord.args.includes("msstore") ? "msstore" : undefined,
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
    fetchManifest({ path: SCOOP_MANIFEST_PATH, config, fetcher }),
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

interface SyncScoopContext {
  config: ManagerConfig;
  current: WindowsLock;
  fetcher: ManifestFetcher | undefined;
  run: typeof runCommand;
  scoopPath: string;
  clean: boolean;
}

const syncScoopPackages = Effect.fn("syncScoopPackages")(function* ({
  config,
  current,
  fetcher,
  run,
  scoopPath,
  clean,
}: SyncScoopContext) {
  const scoop = yield* fetchScoop(config, fetcher);
  yield* updateScoop({
    config,
    noSync: true,
    prune: false,
    fetcher,
    run,
    which: async () => scoopPath,
    scoopPath,
  });
  if (clean) {
    yield* cleanScoopPackages({
      config,
      run,
      executable: scoopPath,
      current,
      desired: scoop.packages.map(packageName),
    });
  }
  return scoop;
});

export const syncWindows = (options: WindowsSyncOptions = {}) =>
  Effect.gen(function* () {
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const current = yield* tryPromise(() => readWindowsLock(config));
    const profiles = yield* Effect.try({
      try: () => resolveWindowsProfiles(options.profiles, current.profiles),
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

    yield* Console.log(ui.heading(`Syncing Windows profiles: ${profiles.join(", ")}…`));
    yield* installWingetPackages(config, run, wingetPath, uniqueWingetPackages);

    if (options.clean) {
      yield* cleanWingetPackages({
        config,
        run,
        executable: wingetPath,
        current,
        desired: uniqueWingetPackages,
      });
    }

    const scoopPath = yield* tryPromise(() => whichFn("scoop"));
    if (scoopPath === undefined) {
      if (!options.wingetOnly) {
        return yield* new CliFailure({ message: "scoop is not installed or not in PATH." });
      }
      yield* Console.log(ui.muted("Scoop is not installed; skipping Scoop until post-install."));
    }

    const scoop =
      scoopPath === undefined
        ? undefined
        : yield* syncScoopPackages({
            config,
            current,
            fetcher,
            run,
            scoopPath,
            clean: options.clean === true,
          });

    const updated = yield* tryPromise(() => readWindowsLock(config));
    replaceManagedRecords(
      updated,
      "winget",
      baselineWingetRecords(uniqueWingetPackages),
      options.clean === true,
    );
    if (scoop !== undefined) {
      replaceManagedRecords(
        updated,
        "scoop",
        baselineScoopRecords(scoop.packages.map(packageName)),
        options.clean === true,
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

const profileFlag = Flag.string("profile").pipe(
  Flag.optional,
  Flag.withDescription(
    "Comma-separated profiles: base, dev, gaming, network, qol, work, or msstore-* profiles.",
  ),
);

export const windowsSyncCommand = Command.make(
  "sync",
  {
    profile: profileFlag,
    clean: Flag.boolean("clean").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Remove tracked packages absent from the selected profiles."),
    ),
    wingetOnly: Flag.boolean("winget-only").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip Scoop while bootstrapping WinGet on a fresh machine."),
    ),
    noPush: Flag.boolean("no-push").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Write the local lockfile without pushing it to the Worker."),
    ),
  },
  ({ profile, clean, wingetOnly, noPush }) =>
    syncWindows({
      profiles: Option.isSome(profile) ? [profile.value] : undefined,
      clean,
      wingetOnly,
      noPush,
    }),
).pipe(
  Command.withDescription(
    "Pull Windows package manifests, reconcile winget and Scoop, and update windows.lock.json.",
  ),
);
