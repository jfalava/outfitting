import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Console, Effect, Schema } from "effect";

import {
  DEFAULT_LINUX_PROFILE,
  loadConfig,
  resolveOutfittingRepo,
  saveConfigFile,
  type ManagerConfig,
} from "@/config";
import { CliFailure, toCliFailure } from "@/errors";
import type { ManifestFetcher } from "@/fetch";
import { tryPromise } from "@/lockfiles/effect";
import {
  detectLinuxPackageManager,
  type DetectLinuxPackageManagerOptions,
  type LinuxPackageManager,
} from "@/platform/linux";
import { runCommand, which } from "@/process";
import { ui } from "@/ui";
import {
  isLinuxProfile,
  LINUX_PROFILES,
  prepareLinuxSource,
  readLinuxManifest,
  type LinuxProfile,
  type LinuxSource,
} from "@/update/linux-source";

export {
  isLinuxProfile,
  LINUX_PROFILES,
  linuxManifestPath,
  type LinuxProfile,
} from "@/update/linux-source";

const LINUX_OWNERSHIP_FILE = "linux-package-ownership.json";

interface LinuxOwnershipState {
  version: 1;
  profiles: Partial<Record<LinuxProfile, Partial<Record<LinuxPackageManager, string[]>>>>;
}

const ManagerOwnershipSchema = Schema.Struct({
  apt: Schema.optionalKey(Schema.Array(Schema.String)),
  pacman: Schema.optionalKey(Schema.Array(Schema.String)),
});

const LinuxOwnershipSchema = Schema.Struct({
  version: Schema.Literal(1),
  profiles: Schema.Struct({
    "generic-linux": Schema.optionalKey(ManagerOwnershipSchema),
    "oci-agents": Schema.optionalKey(ManagerOwnershipSchema),
    "ubuntu-wsl": Schema.optionalKey(ManagerOwnershipSchema),
  }),
});

const decodeLinuxOwnership = Schema.decodeUnknownPromise(LinuxOwnershipSchema);

/** Parse a Linux package manifest as one package name per line. */
export function parseLinuxPackageManifest(content: string): string[] {
  const packages: string[] = [];
  const seen = new Set<string>();
  for (const raw of content.split(/\r?\n/)) {
    const packageName = raw.split("#", 1)[0]?.trim();
    if (packageName === undefined || packageName.length === 0 || seen.has(packageName)) {
      continue;
    }
    if (
      !/^[a-z0-9][a-z0-9+._-]*(?::[a-z0-9][a-z0-9_-]*)?(?:=[a-zA-Z0-9][a-zA-Z0-9.+:~_-]*)?$/.test(
        packageName,
      )
    ) {
      throw new Error(`Invalid Linux package entry: ${raw.trim()}`);
    }
    seen.add(packageName);
    packages.push(packageName);
  }
  return packages;
}

export type LinuxPackageAction = "update" | "upgrade" | "install" | "remove";

export interface LinuxPackageInventoryOptions {
  run?: typeof runCommand;
  which?: typeof which;
}

/** Normalize a package spec for presence checks while preserving the install spec. */
export function linuxPackageIdentity(packageSpec: string): string {
  return packageSpec
    .split("=", 1)[0]!
    .replace(/:[A-Za-z0-9.+_-]+$/, "")
    .toLowerCase();
}

function linuxInventoryArgs(manager: LinuxPackageManager): string[] {
  return manager === "apt" ? ["-W", "-f=${binary:Package}\\t${Status}\\n"] : ["-Qq"];
}

function parseInstalledLinuxPackages(manager: LinuxPackageManager, output: string): Set<string> {
  const installed = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const [packageName, status] = line.split("\t");
    if (manager === "apt" && status !== "install ok installed") {
      continue;
    }
    if (packageName?.trim()) {
      installed.add(linuxPackageIdentity(packageName));
    }
  }
  return installed;
}

export async function listInstalledLinuxPackages(
  manager: LinuxPackageManager,
  options: LinuxPackageInventoryOptions = {},
): Promise<Set<string>> {
  const run = options.run ?? runCommand;
  const whichFn = options.which ?? which;
  const executableName = manager === "apt" ? "dpkg-query" : "pacman";
  const executable = await whichFn(executableName);
  if (executable === undefined) {
    throw new Error(`${executableName} is not installed or not in PATH.`);
  }
  const result = await run(executable, linuxInventoryArgs(manager), { inherit: false });
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(
      `${executableName} package inventory failed (exit ${result.code})${detail ? `: ${detail}` : "."}`,
    );
  }
  return parseInstalledLinuxPackages(manager, result.stdout);
}

export function missingLinuxPackages(
  declared: ReadonlyArray<string>,
  installed: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  return declared.filter((spec) => {
    const identity = linuxPackageIdentity(spec);
    if (seen.has(identity) || installed.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}

function aptPackageManagerArgs(
  action: LinuxPackageAction,
  packages: ReadonlyArray<string>,
  offline = false,
): string[] {
  switch (action) {
    case "update":
      return ["update"];
    case "upgrade":
      return ["upgrade", "-y"];
    case "install":
      return ["install", ...(offline ? ["--no-download"] : []), "-y", ...packages];
    case "remove":
      return ["remove", "-y", ...packages];
  }
}

function pacmanPackageManagerArgs(
  action: LinuxPackageAction,
  packages: ReadonlyArray<string>,
): string[] {
  switch (action) {
    case "update":
    case "upgrade":
      return ["-Syu", "--noconfirm"];
    case "install":
      return ["-S", "--needed", "--noconfirm", ...packages];
    case "remove":
      return ["-R", "--noconfirm", ...packages];
  }
}

export function linuxPackageManagerArgs(
  manager: LinuxPackageManager,
  action: LinuxPackageAction,
  packages: ReadonlyArray<string> = [],
  offline = false,
): string[] {
  if ((action === "install" || action === "remove") && packages.length === 0) {
    throw new Error(`${manager} ${action} requires at least one package.`);
  }
  if (offline && manager === "pacman" && action === "install") {
    throw new Error(
      "Offline pacman installs are refused: no safe cache-only install is supported.",
    );
  }
  return manager === "apt"
    ? aptPackageManagerArgs(action, packages, offline)
    : pacmanPackageManagerArgs(action, packages);
}

interface LinuxCommandOptions {
  manager: LinuxPackageManager;
  executable: string;
  run: typeof runCommand;
  which: typeof which;
}

async function runLinuxPackageCommand(
  options: LinuxCommandOptions,
  action: LinuxPackageAction,
  packages: ReadonlyArray<string> = [],
  offline = false,
): Promise<void> {
  const args = linuxPackageManagerArgs(options.manager, action, packages, offline);
  const sudo = process.getuid?.() !== 0 ? await options.which("sudo") : undefined;
  const command = sudo ?? options.executable;
  const commandArgs = sudo === undefined ? args : [options.executable, ...args];
  const result = await options.run(command, commandArgs, { inherit: true });
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(
      `${options.manager} ${action} failed (exit ${result.code})${detail ? `: ${detail}` : "."}`,
    );
  }
}

export interface LinuxUpdateOptions {
  config?: ManagerConfig;
  packageManager?: LinuxPackageManager;
  offline?: boolean;
  run?: typeof runCommand;
  which?: typeof which;
  osReleasePath?: string;
  readOsRelease?: DetectLinuxPackageManagerOptions["readOsRelease"];
}

export interface LinuxApplyOptions<ConfirmR = never> extends LinuxUpdateOptions {
  profile?: string;
  prune?: boolean;
  yes?: boolean;
  refresh?: boolean;
  sourceFetcher?: ManifestFetcher;
  confirm?: Effect.Effect<boolean, never, ConfirmR>;
}

function resolveProfile(value: string | undefined, config?: ManagerConfig): LinuxProfile {
  const profile = value ?? config?.linux?.profile ?? DEFAULT_LINUX_PROFILE;
  if (!isLinuxProfile(profile)) {
    throw new Error(`Unknown Linux profile \`${profile}\`. Choose: ${LINUX_PROFILES.join(", ")}.`);
  }
  return profile;
}

async function resolveLinuxApplySource<ConfirmR>(
  options: LinuxApplyOptions<ConfirmR>,
  config: ManagerConfig,
  profile: LinuxProfile,
): Promise<LinuxSource | undefined> {
  if (
    options.refresh &&
    options.profile !== undefined &&
    profile !== (config.linux?.profile ?? DEFAULT_LINUX_PROFILE)
  ) {
    throw new CliFailure({
      message:
        "--refresh requires the configured Linux profile; run init or setup first when switching profiles.",
    });
  }
  if (!options.refresh) {
    return undefined;
  }
  return prepareLinuxSource({
    config,
    profile,
    refresh: true,
    offline: options.offline,
    fetcher: options.sourceFetcher,
    run: options.run,
  });
}

export async function runLinuxOciBootstrap(
  config: ManagerConfig,
  run: typeof runCommand,
): Promise<void> {
  return runLinuxBootstrapScript(config, run, "system/oci-agents/bootstrap.sh", "OCI");
}

export async function runLinuxWslBootstrap(
  config: ManagerConfig,
  run: typeof runCommand,
): Promise<void> {
  return runLinuxBootstrapScript(config, run, "system/ubuntu-wsl/bootstrap.sh", "WSL");
}

export async function runLinuxProfileBootstrap(
  profile: LinuxProfile,
  config: ManagerConfig,
  run: typeof runCommand,
): Promise<void> {
  if (profile === "oci-agents") {
    return runLinuxOciBootstrap(config, run);
  }
  if (profile === "ubuntu-wsl") {
    return runLinuxWslBootstrap(config, run);
  }
}

async function runLinuxBootstrapScript(
  config: ManagerConfig,
  run: typeof runCommand,
  relativeScript: string,
  label: string,
): Promise<void> {
  const repo = await resolveOutfittingRepo({ config });
  const script = join(repo.root, relativeScript);
  const result = await run("bash", [script], { cwd: repo.root, inherit: true });
  if (result.code !== 0) {
    throw new Error(`${label} bootstrap failed (exit ${result.code}).`);
  }
}

async function detectManager(options: LinuxUpdateOptions, config: ManagerConfig) {
  const whichFn = options.which ?? which;
  const manager = await detectLinuxPackageManager({
    requested: options.packageManager,
    osReleasePath: options.osReleasePath,
    readOsRelease: options.readOsRelease,
    which: whichFn,
  });
  const executable = await whichFn(manager);
  if (executable === undefined) {
    throw new Error(`Linux package manager \`${manager}\` is not installed or not in PATH.`);
  }
  return { manager, executable, run: options.run ?? runCommand, which: whichFn, config };
}

function emptyOwnership(): LinuxOwnershipState {
  return { version: 1, profiles: {} };
}

async function readOwnership(config: ManagerConfig): Promise<LinuxOwnershipState> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(config.stateRoot, LINUX_OWNERSHIP_FILE), "utf8"),
    );
    const decoded = await decodeLinuxOwnership(parsed);
    const state = emptyOwnership();
    for (const profile of LINUX_PROFILES) {
      const decodedProfile = decoded.profiles[profile];
      if (decodedProfile === undefined) {
        continue;
      }
      const managers: Partial<Record<LinuxPackageManager, string[]>> = {};
      if (decodedProfile.apt !== undefined) {
        managers.apt = [...decodedProfile.apt];
      }
      if (decodedProfile.pacman !== undefined) {
        managers.pacman = [...decodedProfile.pacman];
      }
      for (const names of Object.values(managers)) {
        if (names.some((name) => !/^[a-z0-9][a-z0-9+._-]*$/.test(name))) {
          throw new Error("Invalid owned package identity.");
        }
      }
      state.profiles[profile] = managers;
    }
    return state;
  } catch (cause) {
    if (
      cause instanceof Error &&
      "code" in cause &&
      (cause as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return emptyOwnership();
    }
    throw new Error(`Invalid ${LINUX_OWNERSHIP_FILE}; refusing to guess package ownership.`, {
      cause,
    });
  }
}

async function writeOwnership(config: ManagerConfig, state: LinuxOwnershipState): Promise<void> {
  const path = join(config.stateRoot, LINUX_OWNERSHIP_FILE);
  const temporary = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
}

function owned(
  state: LinuxOwnershipState,
  profile: LinuxProfile,
  manager: LinuxPackageManager,
): string[] {
  return state.profiles[profile]?.[manager] ?? [];
}

function setOwned(
  state: LinuxOwnershipState,
  profile: LinuxProfile,
  manager: LinuxPackageManager,
  packages: ReadonlyArray<string>,
): void {
  const profileState = state.profiles[profile] ?? {};
  profileState[manager] = [...new Set(packages)].toSorted();
  state.profiles[profile] = profileState;
}

function otherOwners(
  state: LinuxOwnershipState,
  active: LinuxProfile,
  manager: LinuxPackageManager,
  name: string,
): LinuxProfile[] {
  return LINUX_PROFILES.filter(
    (profile) => profile !== active && owned(state, profile, manager).includes(name),
  );
}

async function simulateRemoval(
  command: LinuxCommandOptions,
  packages: ReadonlyArray<string>,
): Promise<string[]> {
  const args =
    command.manager === "apt"
      ? ["-s", "remove", ...packages]
      : ["-Rp", "--print-format", "%n", ...packages];
  const result = await command.run(command.executable, args, {
    inherit: false,
    env: { ...process.env, LC_ALL: "C" },
  });
  if (result.code !== 0) {
    throw new Error(
      `${command.manager} removal simulation failed: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  if (command.manager === "apt") {
    return [...result.stdout.matchAll(/^Remv\s+(\S+)/gm)].map((match) =>
      linuxPackageIdentity(match[1]!),
    );
  }
  return result.stdout.split(/\s+/).filter(Boolean).map(linuxPackageIdentity);
}

interface LinuxApplyContext {
  config: ManagerConfig;
  profile: LinuxProfile;
  command: LinuxCommandOptions;
  ownership: LinuxOwnershipState;
}

function installMissingPackages(
  context: LinuxApplyContext,
  missing: ReadonlyArray<string>,
  offline: boolean,
) {
  return Effect.gen(function* () {
    const { command, config, ownership, profile } = context;
    if (missing.length > 0 && command.manager === "apt" && !offline) {
      yield* tryPromise(() => runLinuxPackageCommand(command, "update"));
    }
    for (const packageSpec of missing) {
      yield* Console.log(ui.heading(`Installing ${packageSpec} (${profile})…`));
      yield* tryPromise(() => runLinuxPackageCommand(command, "install", [packageSpec], offline));
      setOwned(ownership, profile, command.manager, [
        ...owned(ownership, profile, command.manager),
        linuxPackageIdentity(packageSpec),
      ]);
      yield* tryPromise(() => writeOwnership(config, ownership));
    }
  });
}

function planLinuxPrune(
  context: LinuxApplyContext,
  declared: ReadonlyArray<string>,
  installed: ReadonlySet<string>,
) {
  return Effect.gen(function* () {
    const { command, ownership, profile } = context;
    const desired = new Set(declared.map(linuxPackageIdentity));
    const stale = owned(ownership, profile, command.manager).filter((name) => !desired.has(name));
    const removable: string[] = [];
    for (const name of stale) {
      if (
        !installed.has(name) ||
        otherOwners(ownership, profile, command.manager, name).length > 0
      ) {
        setOwned(
          ownership,
          profile,
          command.manager,
          owned(ownership, profile, command.manager).filter((item) => item !== name),
        );
      } else {
        removable.push(name);
      }
    }
    if (removable.length === 0) {
      return [];
    }
    const simulation = yield* tryPromise(() => simulateRemoval(command, removable));
    yield* Console.log(ui.heading("Packages to be removed:"));
    for (const name of simulation) {
      yield* Console.log(`  ${command.manager}: ${name}`);
    }
    const unexpected = simulation.filter((name) => !removable.includes(name));
    if (unexpected.length > 0 || removable.some((name) => !simulation.includes(name))) {
      return yield* new CliFailure({
        message: `Refusing unsafe ${command.manager} removal; simulation does not match owned candidates. Unexpected: ${unexpected.join(", ") || "none (incomplete simulation)"}.`,
      });
    }
    return removable;
  });
}

/** Upgrade currently installed packages only; manifests and profiles are intentionally ignored. */
export const updateLinux = (options: LinuxUpdateOptions = {}) =>
  Effect.gen(function* () {
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const command = yield* tryPromise(() => detectManager(options, config));
    if (options.offline) {
      return yield* new CliFailure({
        message: `Offline ${command.manager} upgrades are refused because network-free resolution cannot be guaranteed.`,
      });
    }
    yield* Console.log(ui.heading(`Updating installed Linux packages with ${command.manager}…`));
    if (command.manager === "apt") {
      yield* tryPromise(() => runLinuxPackageCommand(command, "update"));
    }
    yield* tryPromise(() => runLinuxPackageCommand(command, "upgrade"));
    yield* Console.log(ui.success(`Linux ${command.manager} update complete.`));
  });

function reconcileOwnership(
  context: LinuxApplyContext,
  declared: string[],
  installed: ReadonlySet<string>,
): void {
  const { ownership, profile, command } = context;
  // Forget absent installations before assigning shared ownership. Never claim manual installs.
  for (const owner of LINUX_PROFILES) {
    setOwned(
      ownership,
      owner,
      command.manager,
      owned(ownership, owner, command.manager).filter((name) => installed.has(name)),
    );
  }
  const shared = declared
    .map(linuxPackageIdentity)
    .filter((name) => otherOwners(ownership, profile, command.manager, name).length > 0);
  setOwned(ownership, profile, command.manager, [
    ...owned(ownership, profile, command.manager),
    ...shared,
  ]);
}

function executeLinuxApply(
  context: LinuxApplyContext,
  missing: string[],
  removals: string[],
  offline: boolean,
) {
  return Effect.gen(function* () {
    const { config, ownership, command, profile } = context;
    yield* tryPromise(() => writeOwnership(config, ownership));
    yield* installMissingPackages(context, missing, offline);
    if (removals.length > 0) {
      const currentPlan = yield* tryPromise(() => simulateRemoval(command, removals));
      if (
        currentPlan.length !== removals.length ||
        currentPlan.some((name) => !removals.includes(name))
      ) {
        return yield* new CliFailure({
          message: "Removal plan changed after installation; rerun apply --prune to review it.",
        });
      }
      yield* tryPromise(() => runLinuxPackageCommand(command, "remove", removals));
      setOwned(
        ownership,
        profile,
        command.manager,
        owned(ownership, profile, command.manager).filter((name) => !removals.includes(name)),
      );
      yield* tryPromise(() => writeOwnership(config, ownership));
    }
  });
}

/** Reconcile one local Linux profile and optionally prune only its proven ownership. */
export const applyLinux = <ConfirmR = never>(options: LinuxApplyOptions<ConfirmR> = {}) =>
  Effect.gen(function* () {
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const profile = yield* Effect.try({
      try: () => resolveProfile(options.profile, config),
      catch: toCliFailure,
    });
    const source = yield* tryPromise(() => resolveLinuxApplySource(options, config, profile));
    const command = yield* tryPromise(() => detectManager(options, config));
    const declared = yield* Effect.tryPromise({
      try: async () =>
        parseLinuxPackageManifest(await readLinuxManifest(config, profile, source?.root)),
      catch: toCliFailure,
    });
    const installed = yield* tryPromise(() => listInstalledLinuxPackages(command.manager, command));
    const missing = missingLinuxPackages(declared, installed);
    const ownership = yield* tryPromise(() => readOwnership(config));
    const context = { config, profile, command, ownership } satisfies LinuxApplyContext;
    reconcileOwnership(context, declared, installed);
    const removals = options.prune ? yield* planLinuxPrune(context, declared, installed) : [];
    for (const spec of missing) {
      yield* Console.log(`  install ${command.manager}: ${spec}`);
    }
    if ((missing.length > 0 || removals.length > 0) && !options.yes) {
      const confirmed = options.confirm === undefined ? false : yield* options.confirm;
      if (!confirmed) {
        yield* Console.log(ui.muted("Aborted. No package changes were made."));
        return;
      }
    }
    if (options.profile !== undefined && config.linux?.profile !== profile) {
      yield* tryPromise(() =>
        saveConfigFile({ linux: { profile } }, { stateRoot: config.stateRoot }),
      );
    }
    yield* executeLinuxApply(context, missing, removals, options.offline === true);
    yield* Console.log(ui.success(`Linux ${command.manager} profile applied (${profile}).`));
  });
