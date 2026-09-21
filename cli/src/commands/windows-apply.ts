import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Console, Effect, Option } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import {
  loadConfig,
  manifestsDir,
  readRepoPathFile,
  resolveWindowsRoutes,
  type ManagerConfig,
  type WindowsRoutesConfig,
} from "@/config";
import { CliFailure } from "@/errors";
import { fetchManifest } from "@/fetch";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which } from "@/process";
import { envValue } from "@/secrets";
import {
  selectWindowsByorProfiles,
  tryReadByorContract,
  windowsRoutesFromContract,
  type ByorContract,
  type SelectedWindowsByorProfiles,
} from "@/source/contract";
import {
  parseWindowsPackageList,
  type WindowsWingetPackage,
} from "@/source/windows-manifest";
import { ui } from "@/ui";
import { parseScoopManifest, type ScoopBucket, type ScoopManifest } from "@/update/scoop";
import { runScoopCommand } from "@/update/scoop-command";
import {
  isWingetAlreadyInstalledExitCode,
  isWingetPackageAbsentExitCode,
  readWindowsLock,
  recordWindowsOperation,
  wingetIdentity,
  wingetSource,
  writeWindowsLock,
  type WindowsLock,
  type WindowsPackageRecord,
} from "@/update/windows-lock";
import { parseScoopExport } from "@/update/windows-snapshot";
import { wingetPackageArgs } from "@/update/winget";

export const WINDOWS_PROFILE_NAMES = ["base", "dev", "gaming", "network", "qol", "work"] as const;

export type { WindowsWingetPackage };
export { parseWindowsPackageList };

export interface WindowsSourceResolution {
  routes: WindowsRoutesConfig;
  /** When set, winget paths come from the contract — never from template substitution. */
  byor: SelectedWindowsByorProfiles | undefined;
  contract: ByorContract | undefined;
}

/** Resolve Windows routes from a local BYOR contract when present, else config.json. */
export async function resolveWindowsSource(
  config: ManagerConfig,
  profiles?: ReadonlyArray<string>,
): Promise<WindowsSourceResolution> {
  const repo = envValue("OUTFITTING_REPO") ?? (await readRepoPathFile(config));
  if (repo !== undefined) {
    const contract = await tryReadByorContract(repo);
    if (contract !== undefined) {
      const hasWindows = Object.values(contract.profiles).some(
        (entry) => entry.windows !== undefined,
      );
      if (hasWindows) {
        const byor = selectWindowsByorProfiles(
          contract,
          profiles === undefined ? undefined : [...profiles],
        );
        return {
          routes: windowsRoutesFromContract(contract),
          byor,
          contract,
        };
      }
    }
  }
  return {
    routes: resolveWindowsRoutes(config.windows),
    byor: undefined,
    contract: undefined,
  };
}

export function windowsWingetProfilePath(
  config: ManagerConfig,
  profile: string,
  source?: WindowsSourceResolution,
): string {
  if (source?.byor !== undefined) {
    const path = source.byor.wingetPaths[profile];
    if (path === undefined) {
      throw new Error(
        `Unknown BYOR Windows profile \`${profile}\`. Choose: ${source.byor.names.join(", ")}.`,
      );
    }
    return path;
  }
  return (source?.routes ?? resolveWindowsRoutes(config.windows)).wingetProfilePath.replaceAll(
    "{profile}",
    profile,
  );
}

export function windowsPowerShellProfilePath(
  config: ManagerConfig,
  source?: WindowsSourceResolution,
): string {
  return (source?.routes ?? resolveWindowsRoutes(config.windows)).powershellProfilePath;
}

export function windowsScoopPath(
  config: ManagerConfig,
  source?: WindowsSourceResolution,
): string {
  return (source?.routes ?? resolveWindowsRoutes(config.windows)).scoopPath;
}

export interface WindowsApplyOptions<ConfirmR = never> {
  config?: ManagerConfig;
  profiles?: ReadonlyArray<string>;
  wingetOnly?: boolean;
  prune?: boolean;
  yes?: boolean;
  run?: typeof runCommand;
  which?: typeof which;
  confirm?: Effect.Effect<boolean, never, ConfirmR>;
}

interface OwnedWingetPackage extends WindowsWingetPackage {
  owners: string[];
}

interface ApplyRemoval {
  manager: "winget" | "scoop";
  record: WindowsPackageRecord;
}

interface ApplyPlan {
  wingetInstalls: OwnedWingetPackage[];
  scoopBuckets: ScoopBucket[];
  scoopInstalls: string[];
  removals: ApplyRemoval[];
}

function packageName(value: string): string {
  return value.split("/").at(-1) ?? value;
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
  ].filter(Boolean);
  const invalid = normalized.filter((profile) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile));
  if (invalid.length > 0) {
    throw new Error(`Invalid Windows profile name(s): ${invalid.join(", ")}.`);
  }
  if (normalized.length === 0) {
    throw new Error("At least one Windows profile must be selected.");
  }
  return normalized;
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
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
}

async function readDeclaration(
  config: ManagerConfig,
  path: string,
): Promise<{ text: string; path: string }> {
  const repo = envValue("OUTFITTING_REPO") ?? (await readRepoPathFile(config));
  if (repo !== undefined) {
    return { text: await readFile(join(repo, path), "utf8"), path: join(repo, path) };
  }
  const candidates = [join(manifestsDir(config.stateRoot), path)];
  for (const candidate of candidates) {
    const text = await readOptionalFile(candidate);
    if (text !== undefined) {
      return { text, path: candidate };
    }
  }
  const manifest = await fetchManifest({
    path,
    config,
    offline: true,
  });
  return { text: manifest.text, path: manifest.path };
}

const loadDeclarations = Effect.fn("loadWindowsDeclarations")(function* (
  config: ManagerConfig,
  profiles: ReadonlyArray<string>,
  source: WindowsSourceResolution,
  options: WindowsApplyOptions<unknown>,
) {
  const byIdentity = new Map<string, OwnedWingetPackage>();
  for (const profile of profiles) {
    const manifest = yield* tryPromise(() =>
      readDeclaration(config, windowsWingetProfilePath(config, profile, source)),
    );
    const entries = yield* Effect.try({
      try: () => parseWindowsPackageList(manifest.text, manifest.path),
      catch: (cause) =>
        new CliFailure({ message: cause instanceof Error ? cause.message : String(cause) }),
    });
    for (const entry of entries) {
      const identity = wingetIdentity(entry.name, entry.source);
      const existing = byIdentity.get(identity);
      if (existing === undefined) {
        byIdentity.set(identity, { ...entry, owners: [profile] });
      } else {
        existing.owners.push(profile);
      }
    }
  }

  if (options.wingetOnly) {
    return { winget: [...byIdentity.values()], scoop: undefined };
  }
  const scoopManifest = yield* tryPromise(() =>
    readDeclaration(config, windowsScoopPath(config, source)),
  );
  const scoop = yield* Effect.try({
    try: () => parseScoopManifest(scoopManifest.text),
    catch: (cause) =>
      new CliFailure({ message: cause instanceof Error ? cause.message : String(cause) }),
  });
  return { winget: [...byIdentity.values()], scoop };
});

async function wingetInstalled(
  run: typeof runCommand,
  executable: string,
  packageInfo: WindowsWingetPackage,
): Promise<boolean> {
  const result = await run(
    executable,
    [
      "list",
      "--id",
      packageInfo.name,
      "--exact",
      "--source",
      packageInfo.source ?? "winget",
      "--accept-source-agreements",
    ],
    { inherit: false },
  );
  if (result.code === 0) {
    return true;
  }
  if (isWingetPackageAbsentExitCode(result.code)) {
    return false;
  }
  const detail = (result.stderr || result.stdout).trim();
  throw new Error(
    `winget list ${packageInfo.name} failed (exit ${result.code})${detail ? `: ${detail}` : "."}`,
  );
}

function provenPruneCandidates(
  current: WindowsLock,
  profiles: ReadonlyArray<string>,
  winget: ReadonlyArray<WindowsWingetPackage>,
  scoop: ScoopManifest | undefined,
): ApplyRemoval[] {
  const active = new Set(profiles);
  const desiredWinget = new Set(winget.map((entry) => wingetIdentity(entry.name, entry.source)));
  const desiredScoop = new Set(
    (scoop?.packages ?? []).map((entry) => packageName(entry).toLowerCase()),
  );
  const removable = (record: WindowsPackageRecord) =>
    record.origin === "baseline" &&
    record.installedBy === "outfitting" &&
    record.owners !== undefined &&
    record.owners.length > 0 &&
    record.owners.every((owner) => active.has(owner));
  return [
    ...current.packages.winget
      .filter(
        (record) =>
          removable(record) &&
          !desiredWinget.has(wingetIdentity(record.name, wingetSource(record.args))),
      )
      .map((record) => ({ manager: "winget" as const, record })),
    ...(scoop === undefined
      ? []
      : current.packages.scoop
          .filter((record) => removable(record) && !desiredScoop.has(record.name.toLowerCase()))
          .map((record) => ({ manager: "scoop" as const, record }))),
  ];
}

const printPlan = Effect.fn("printWindowsApplyPlan")(function* (plan: ApplyPlan) {
  yield* Console.log(ui.heading("Windows apply plan:"));
  if (
    plan.wingetInstalls.length +
      plan.scoopBuckets.length +
      plan.scoopInstalls.length +
      plan.removals.length ===
    0
  ) {
    yield* Console.log(ui.muted("  No package changes."));
    return;
  }
  for (const entry of plan.wingetInstalls) {
    yield* Console.log(`  install WinGet: ${entry.source ?? "winget"}:${entry.name}`);
  }
  for (const bucket of plan.scoopBuckets) {
    yield* Console.log(`  add Scoop bucket: ${bucket.name}`);
  }
  for (const entry of plan.scoopInstalls) {
    yield* Console.log(`  install Scoop: ${entry}`);
  }
  for (const entry of plan.removals) {
    yield* Console.log(`  remove ${entry.manager}: ${entry.record.name}`);
  }
});

const confirmPlan = Effect.fn("confirmWindowsApplyPlan")(function* <R>(
  plan: ApplyPlan,
  yes: boolean,
  confirmation: Effect.Effect<boolean, never, R> | undefined,
) {
  yield* printPlan(plan);
  const hasChanges =
    plan.wingetInstalls.length +
      plan.scoopBuckets.length +
      plan.scoopInstalls.length +
      plan.removals.length >
    0;
  if (!hasChanges || yes) {
    return true;
  }
  if (confirmation === undefined) {
    return yield* new CliFailure({ message: "Confirmation is required to apply package changes." });
  }
  const confirmed = yield* confirmation;
  if (!confirmed) {
    yield* Console.log(ui.muted("Aborted. No package changes were made."));
  }
  return confirmed;
});

function scoopInstalledNames(output: string): Set<string> {
  return new Set(parseScoopExport(output).apps.map((app) => app.Name.toLowerCase()));
}

const recordApplyOperation = (input: {
  config: ManagerConfig;
  manager: "winget" | "scoop";
  action: "install" | "uninstall";
  name: string;
  args: string[];
  status: "success" | "failed";
  exitCode: number;
  owners?: ReadonlyArray<string>;
}) => {
  const successfulInstall = input.action === "install" && input.status === "success";
  return recordWindowsOperation({
    ...input,
    origin: successfulInstall ? "baseline" : undefined,
    installedBy: successfulInstall ? "outfitting" : undefined,
    owners: successfulInstall ? input.owners : undefined,
  });
};

function reconcileOwners(
  lock: WindowsLock,
  { profiles, declarations: { winget, scoop }, prune }: ApplyContext,
): void {
  const active = new Set(profiles);
  const wingetOwners = new Map(
    winget.map((entry) => [wingetIdentity(entry.name, entry.source), entry.owners]),
  );
  const scoopOwners = new Map(
    (scoop === undefined ? [] : scoop.packages).map((entry) => [
      packageName(entry).toLowerCase(),
      [...profiles],
    ]),
  );
  for (const [manager, desired] of [
    ["winget", wingetOwners],
    ["scoop", scoopOwners],
  ] as const) {
    if (manager === "scoop" && scoop === undefined) {
      continue;
    }
    for (const record of lock.packages[manager]) {
      if (record.installedBy !== "outfitting" || record.owners === undefined) {
        continue;
      }
      const identity =
        manager === "winget"
          ? wingetIdentity(record.name, wingetSource(record.args))
          : record.name.toLowerCase();
      const activeOwners = desired.get(identity);
      if (activeOwners === undefined) {
        const remaining = record.owners.filter((owner) => !active.has(owner));
        if (prune && remaining.length > 0) {
          record.owners = remaining;
        }
        continue;
      }
      record.owners = [
        ...new Set([...record.owners.filter((owner) => !active.has(owner)), ...activeOwners]),
      ].toSorted();
    }
  }
}

interface ApplyContext {
  config: ManagerConfig;
  profiles: string[];
  declarations: { winget: OwnedWingetPackage[]; scoop: ScoopManifest | undefined };
  run: typeof runCommand;
  wingetPath: string;
  scoopPath: string | undefined;
  plan: ApplyPlan;
  prune: boolean;
}

const inspectScoop = Effect.fn("inspectWindowsScoop")(function* (
  run: typeof runCommand,
  whichFn: typeof which,
) {
  const path = yield* tryPromise(() => whichFn("scoop"));
  if (path === undefined) {
    return yield* new CliFailure({ message: "scoop is not installed or not in PATH." });
  }
  const exported = yield* tryPromise(() =>
    runScoopCommand(run, path, ["export"], { inherit: false }),
  );
  if (exported.code !== 0) {
    return yield* new CliFailure({ message: `scoop export failed (exit ${exported.code}).` });
  }
  const state = yield* Effect.try({
    try: () => parseScoopExport(exported.stdout),
    catch: (cause) =>
      new CliFailure({ message: cause instanceof Error ? cause.message : String(cause) }),
  });
  return {
    path,
    installed: scoopInstalledNames(exported.stdout),
    buckets: new Set(state.buckets.map((bucket) => bucket.Name.toLowerCase())),
  };
});

function buildApplyPlan(options: {
  current: WindowsLock;
  profiles: ReadonlyArray<string>;
  declarations: ApplyContext["declarations"];
  wingetInstalls: OwnedWingetPackage[];
  installedScoop: ReadonlySet<string>;
  scoopBuckets: ReadonlySet<string>;
  prune: boolean;
}): ApplyPlan {
  const { current, profiles, declarations, wingetInstalls, installedScoop, scoopBuckets, prune } =
    options;
  const scoopInstalls = (declarations.scoop?.packages ?? []).filter(
    (entry) => !installedScoop.has(packageName(entry).toLowerCase()),
  );
  const missingBuckets = (declarations.scoop?.buckets ?? []).filter(
    (bucket) => !scoopBuckets.has(bucket.name.toLowerCase()),
  );
  const removals = prune
    ? provenPruneCandidates(current, profiles, declarations.winget, declarations.scoop)
    : [];
  return { wingetInstalls, scoopBuckets: missingBuckets, scoopInstalls, removals };
}

function prepareApply<ConfirmR>(options: WindowsApplyOptions<ConfirmR>) {
  return Effect.gen(function* () {
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const current = yield* tryPromise(() => readWindowsLock(config));
    // Resolve BYOR first so defaultProfiles come from the contract when present.
    const source = yield* tryPromise(() => resolveWindowsSource(config, options.profiles));
    const profiles = yield* Effect.try({
      try: () =>
        resolveWindowsProfiles(
          options.profiles,
          current.profiles,
          source.routes.defaultProfiles,
        ),
      catch: (cause) =>
        new CliFailure({ message: cause instanceof Error ? cause.message : String(cause) }),
    });
    // Re-select BYOR with the final profile list so winget paths match the lock selection.
    const resolved =
      source.contract === undefined
        ? source
        : {
            ...source,
            byor: selectWindowsByorProfiles(source.contract, profiles),
            routes: windowsRoutesFromContract(source.contract),
          };
    const declarations = yield* loadDeclarations(config, profiles, resolved, options);
    const run = options.run ?? runCommand;
    const whichFn = options.which ?? which;
    const wingetPath = yield* tryPromise(() => whichFn("winget"));
    if (wingetPath === undefined) {
      return yield* new CliFailure({ message: "winget is not installed or not in PATH." });
    }

    const wingetInstalls: OwnedWingetPackage[] = [];
    for (const entry of declarations.winget) {
      if (!(yield* tryPromise(() => wingetInstalled(run, wingetPath, entry)))) {
        wingetInstalls.push(entry);
      }
    }

    let scoopPath: string | undefined;
    let installedScoop = new Set<string>();
    let scoopBuckets = new Set<string>();
    if (!options.wingetOnly) {
      const scoop = yield* inspectScoop(run, whichFn);
      scoopPath = scoop.path;
      installedScoop = scoop.installed;
      scoopBuckets = scoop.buckets;
    }
    return {
      config,
      profiles,
      declarations,
      run,
      wingetPath,
      scoopPath,
      prune: options.prune === true,
      plan: buildApplyPlan({
        current,
        profiles,
        declarations,
        wingetInstalls,
        installedScoop,
        scoopBuckets,
        prune: options.prune === true,
      }),
    } satisfies ApplyContext;
  });
}

const installWinget = Effect.fn("installWindowsWinget")(function* (context: ApplyContext) {
  for (const entry of context.plan.wingetInstalls) {
    const args = [
      ...wingetPackageArgs("install", entry.name, entry.source ?? "winget"),
      "--no-upgrade",
    ];
    const result = yield* tryPromise(() =>
      context.run(context.wingetPath, args, { inherit: true }),
    );
    const alreadyInstalled = isWingetAlreadyInstalledExitCode(result.code);
    if (alreadyInstalled) {
      yield* Console.log(
        ui.muted(`WinGet package became preexisting: ${entry.name}; ownership not claimed.`),
      );
      continue;
    }
    yield* tryPromise(() =>
      recordApplyOperation({
        config: context.config,
        manager: "winget",
        action: "install",
        name: entry.name,
        args,
        status: result.code === 0 ? "success" : "failed",
        exitCode: result.code,
        owners: entry.owners,
      }),
    );
    if (result.code !== 0) {
      return yield* new CliFailure({
        message: `winget install ${entry.name} failed (exit ${result.code}).`,
      });
    }
  }
});

const installScoop = Effect.fn("installWindowsScoop")(function* (context: ApplyContext) {
  if (context.scoopPath === undefined || context.declarations.scoop === undefined) {
    return;
  }
  for (const bucket of context.plan.scoopBuckets) {
    const result = yield* tryPromise(() =>
      runScoopCommand(context.run, context.scoopPath!, ["bucket", "add", bucket.name, bucket.url], {
        inherit: true,
      }),
    );
    if (result.code !== 0) {
      return yield* new CliFailure({
        message: `scoop bucket add ${bucket.name} failed (exit ${result.code}).`,
      });
    }
  }
  for (const spec of context.plan.scoopInstalls) {
    const args = ["install", spec];
    const result = yield* tryPromise(() =>
      runScoopCommand(context.run, context.scoopPath!, args, { inherit: true }),
    );
    yield* tryPromise(() =>
      recordApplyOperation({
        config: context.config,
        manager: "scoop",
        action: "install",
        name: packageName(spec),
        args,
        status: result.code === 0 ? "success" : "failed",
        exitCode: result.code,
        owners: context.profiles,
      }),
    );
    if (result.code !== 0) {
      return yield* new CliFailure({
        message: `scoop install ${spec} failed (exit ${result.code}).`,
      });
    }
  }
});

const executeRemovals = Effect.fn("pruneWindowsPackages")(function* (context: ApplyContext) {
  for (const removal of context.plan.removals) {
    const args =
      removal.manager === "winget"
        ? wingetPackageArgs("uninstall", removal.record.name, wingetSource(removal.record.args))
        : ["uninstall", removal.record.name];
    const result = yield* tryPromise(() =>
      removal.manager === "winget"
        ? context.run(context.wingetPath, args, { inherit: true })
        : runScoopCommand(context.run, context.scoopPath!, args, { inherit: true }),
    );
    yield* tryPromise(() =>
      recordApplyOperation({
        config: context.config,
        manager: removal.manager,
        action: "uninstall",
        name: removal.record.name,
        args,
        status: result.code === 0 ? "success" : "failed",
        exitCode: result.code,
      }),
    );
    if (result.code !== 0) {
      return yield* new CliFailure({
        message: `${removal.manager} uninstall ${removal.record.name} failed (exit ${result.code}).`,
      });
    }
  }
});

const persistApply = Effect.fn("persistWindowsApply")(function* (context: ApplyContext) {
  const updated = yield* tryPromise(() => readWindowsLock(context.config));
  // An observed absence invalidates old installation evidence, even if reinstall fails.
  const missingWinget = new Set(
    context.plan.wingetInstalls.map((entry) => wingetIdentity(entry.name, entry.source)),
  );
  const missingScoop = new Set(
    context.plan.scoopInstalls.map((entry) => packageName(entry).toLowerCase()),
  );
  updated.packages.winget = updated.packages.winget.filter(
    (entry) => !missingWinget.has(wingetIdentity(entry.name, wingetSource(entry.args))),
  );
  updated.packages.scoop = updated.packages.scoop.filter(
    (entry) => !missingScoop.has(entry.name.toLowerCase()),
  );
  reconcileOwners(updated, context);
  updated.profiles = [...context.profiles];
  updated.machine = context.config.machineId;
  updated.source = { ...context.config.manifest };
  yield* tryPromise(() => writeWindowsLock(updated, { root: context.config.stateRoot }));
});

export const applyWindows = <ConfirmR = never>(options: WindowsApplyOptions<ConfirmR> = {}) =>
  Effect.gen(function* () {
    const context = yield* prepareApply(options);
    if (!(yield* confirmPlan(context.plan, options.yes === true, options.confirm))) {
      return;
    }
    yield* persistApply(context);
    yield* installWinget(context);
    yield* installScoop(context);
    yield* executeRemovals(context);
    yield* Console.log(ui.success("Windows declarations applied locally."));
  });

const profileFlag = Flag.String("profile").pipe(
  Flag.optional,
  Flag.withDescription("Comma-separated profiles from the configured repository."),
);

export const windowsApplyCommand = Command.make(
  "apply",
  {
    profile: profileFlag,
    wingetOnly: Flag.Boolean("winget-only").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Apply only WinGet declarations; skip Scoop even when installed."),
    ),
    prune: Flag.Boolean("prune").pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "Remove only provably Outfitting-installed packages no longer declared by active profiles.",
      ),
    ),
    yes: Flag.Boolean("yes").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Apply the displayed plan without prompting."),
    ),
  },
  ({ profile, wingetOnly, prune, yes }) =>
    applyWindows({
      profiles: Option.isSome(profile) ? [profile.value] : undefined,
      wingetOnly,
      prune,
      yes,
      confirm: Prompt.Confirm({ message: "Apply this plan?", initial: false }).pipe(Effect.orDie),
    }),
).pipe(
  Command.withDescription(
    "Install missing locally declared Windows packages; optionally prune proven ownership.",
  ),
);
