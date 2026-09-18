import { join } from "node:path";

import { Console, Effect } from "effect";

import {
  DEFAULT_LINUX_PROFILE,
  loadConfig,
  resolveOutfittingRepo,
  type ManagerConfig,
} from "@/config";
import { CliFailure, toCliFailure } from "@/errors";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { tryPromise } from "@/lockfiles/effect";
import {
  detectLinuxPackageManager,
  type DetectLinuxPackageManagerOptions,
  type LinuxPackageManager,
} from "@/platform/linux";
import { runCommand, which } from "@/process";
import { ui } from "@/ui";

export const LINUX_PROFILES = ["generic-linux", "oci-agents", "ubuntu-wsl"] as const;
export type LinuxProfile = (typeof LINUX_PROFILES)[number];

const LINUX_PROFILE_MANIFEST_PATHS = {
  "generic-linux": "packages/linux/generic-linux.txt",
  "oci-agents": "packages/linux/oci-agents.txt",
  "ubuntu-wsl": "packages/ubuntu-wsl/apt.txt",
} satisfies Record<LinuxProfile, string>;

export function isLinuxProfile(value: string): value is LinuxProfile {
  return (LINUX_PROFILES as ReadonlyArray<string>).includes(value);
}

export function linuxManifestPath(profile: LinuxProfile): string {
  return LINUX_PROFILE_MANIFEST_PATHS[profile];
}

/** Parse a Linux package manifest as one package name per line. */
export function parseLinuxPackageManifest(content: string): string[] {
  const packages: string[] = [];
  const seen = new Set<string>();
  for (const raw of content.split(/\r?\n/)) {
    const packageName = raw.split("#", 1)[0]?.trim();
    if (packageName === undefined || packageName.length === 0 || seen.has(packageName)) {
      continue;
    }
    if (/\s/.test(packageName)) {
      throw new Error(`Invalid Linux package entry: ${raw.trim()}`);
    }
    seen.add(packageName);
    packages.push(packageName);
  }
  return packages;
}

export type LinuxPackageAction = "update" | "upgrade" | "install";

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

/** Return installed package identities without exposing the host's full package inventory. */
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
      `${executableName} package inventory failed (exit ${result.code})${detail.length > 0 ? `: ${detail}` : "."}`,
    );
  }

  return parseInstalledLinuxPackages(manager, result.stdout);
}

/** Find declared packages that are absent; unrelated installed packages are intentionally ignored. */
export function missingLinuxPackages(
  declared: ReadonlyArray<string>,
  installed: ReadonlySet<string>,
): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const packageSpec of declared) {
    const identity = linuxPackageIdentity(packageSpec);
    if (!seen.has(identity) && !installed.has(identity)) {
      seen.add(identity);
      missing.push(packageSpec);
    }
  }
  return missing;
}

function aptPackageManagerArgs(
  action: LinuxPackageAction,
  packages: ReadonlyArray<string>,
): string[] {
  switch (action) {
    case "update":
      return ["update"];
    case "upgrade":
      return ["upgrade", "-y"];
    case "install":
      return ["install", "-y", ...packages];
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
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
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/** Build safe native package-manager arguments without using apt-get. */
export function linuxPackageManagerArgs(
  manager: LinuxPackageManager,
  action: LinuxPackageAction,
  packages: ReadonlyArray<string> = [],
): string[] {
  if (action === "install" && packages.length === 0) {
    throw new Error(`${manager} ${action} requires at least one package.`);
  }

  return manager === "apt"
    ? aptPackageManagerArgs(action, packages)
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
): Promise<void> {
  const args = linuxPackageManagerArgs(options.manager, action, packages);
  const shouldUseSudo = process.getuid?.() !== 0;
  const sudo = shouldUseSudo ? await options.which("sudo") : undefined;
  const command = sudo ?? options.executable;
  const commandArgs = sudo === undefined ? args : [options.executable, ...args];
  const result = await options.run(command, commandArgs, { inherit: true });
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(
      `${options.manager} ${action} failed (exit ${result.code})${detail.length > 0 ? `: ${detail}` : "."}`,
    );
  }
}

export interface LinuxUpdateOptions {
  config?: ManagerConfig;
  profile?: string;
  packageManager?: LinuxPackageManager;
  offline?: boolean;
  run?: typeof runCommand;
  which?: typeof which;
  fetcher?: ManifestFetcher;
  osReleasePath?: string;
  readOsRelease?: DetectLinuxPackageManagerOptions["readOsRelease"];
  /** Disable the profile's Nix/Home Manager bootstrap for tests or package-only callers. */
  bootstrapNix?: boolean;
}

export type LinuxSyncOptions = Omit<LinuxUpdateOptions, "bootstrapNix">;

function resolveProfile(value: string | undefined, config?: ManagerConfig): LinuxProfile {
  const profile = value ?? config?.linux?.profile ?? DEFAULT_LINUX_PROFILE;
  if (!isLinuxProfile(profile)) {
    throw new Error(`Unknown Linux profile \`${profile}\`. Choose: ${LINUX_PROFILES.join(", ")}.`);
  }
  return profile;
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
  switch (profile) {
    case "generic-linux":
      return;
    case "oci-agents":
      return runLinuxOciBootstrap(config, run);
    case "ubuntu-wsl":
      return runLinuxWslBootstrap(config, run);
    default: {
      const exhaustive: never = profile;
      return exhaustive;
    }
  }
}

async function runLinuxBootstrapScript(
  config: ManagerConfig,
  run: typeof runCommand,
  relativeScript: string,
  profileLabel: string,
): Promise<void> {
  const repo = await resolveOutfittingRepo({ config });
  const script = join(repo.root, relativeScript);
  const result = await run("bash", [script], { cwd: repo.root, inherit: true });
  if (result.code !== 0) {
    throw new Error(`${profileLabel} bootstrap failed (exit ${result.code}).`);
  }
}

/** Update native Linux packages, optionally followed by the profile bootstrap. */
export const updateLinux = (options: LinuxUpdateOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    const whichFn = options.which ?? which;
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const profile = yield* Effect.try({
      try: () => resolveProfile(options.profile, config),
      catch: toCliFailure,
    });
    const manager = yield* tryPromise(() =>
      detectLinuxPackageManager({
        requested: options.packageManager,
        osReleasePath: options.osReleasePath,
        readOsRelease: options.readOsRelease,
        which: whichFn,
      }),
    );
    const executable = yield* tryPromise(() => whichFn(manager));
    if (executable === undefined) {
      return yield* new CliFailure({
        message: `Linux package manager \`${manager}\` is not installed or not in PATH.`,
      });
    }

    const manifest = yield* tryPromise(() =>
      fetchManifest({
        path: linuxManifestPath(profile),
        config,
        fetcher: options.fetcher,
        offline: options.offline,
      }),
    );
    if (manifest.warning) {
      yield* Console.log(ui.muted(manifest.warning));
    }
    const declared = yield* Effect.try({
      try: () => parseLinuxPackageManifest(manifest.text),
      catch: toCliFailure,
    });
    const installed = yield* tryPromise(() =>
      listInstalledLinuxPackages(manager, { run, which: whichFn }),
    );
    const missing = missingLinuxPackages(declared, installed);
    const commandOptions = {
      manager,
      executable,
      run,
      which: whichFn,
    } satisfies LinuxCommandOptions;

    yield* Console.log(ui.heading(`Updating Linux packages with ${manager} (${profile})…`));
    if (manager === "apt") {
      yield* tryPromise(() => runLinuxPackageCommand(commandOptions, "update"));
    }
    yield* tryPromise(() => runLinuxPackageCommand(commandOptions, "upgrade"));
    if (missing.length > 0) {
      yield* Console.log(
        ui.heading(`Installing ${missing.length} missing managed package(s)…`),
      );
      yield* tryPromise(() => runLinuxPackageCommand(commandOptions, "install", missing));
    } else {
      yield* Console.log(ui.muted(`All ${declared.length} managed package(s) already present.`));
    }

    if (profile !== "generic-linux" && options.bootstrapNix !== false) {
      yield* Console.log(ui.heading(`Applying ${profile} Nix/Home Manager configuration…`));
      yield* tryPromise(() => runLinuxProfileBootstrap(profile, config, run));
    }

    yield* Console.log(ui.success(`Linux ${manager} update complete.`));
  });

/** Install missing declared Linux packages without removing unrelated packages. */
export const syncLinux = (options: LinuxSyncOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    const whichFn = options.which ?? which;
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const profile = yield* Effect.try({
      try: () => resolveProfile(options.profile, config),
      catch: toCliFailure,
    });
    const manager = yield* tryPromise(() =>
      detectLinuxPackageManager({
        requested: options.packageManager,
        osReleasePath: options.osReleasePath,
        readOsRelease: options.readOsRelease,
        which: whichFn,
      }),
    );
    const executable = yield* tryPromise(() => whichFn(manager));
    if (executable === undefined) {
      return yield* new CliFailure({
        message: `Linux package manager \`${manager}\` is not installed or not in PATH.`,
      });
    }
    const manifest = yield* tryPromise(() =>
      fetchManifest({
        path: linuxManifestPath(profile),
        config,
        fetcher: options.fetcher,
        offline: options.offline,
      }),
    );
    if (manifest.warning) {
      yield* Console.log(ui.muted(manifest.warning));
    }
    const declared = yield* Effect.try({
      try: () => parseLinuxPackageManifest(manifest.text),
      catch: toCliFailure,
    });
    const installed = yield* tryPromise(() =>
      listInstalledLinuxPackages(manager, { run, which: whichFn }),
    );
    const missing = missingLinuxPackages(declared, installed);

    if (missing.length === 0) {
      yield* Console.log(ui.success(`Linux ${manager} packages are present (${profile}).`));
      return;
    }

    yield* Console.log(
      ui.heading(`Installing ${missing.length} missing ${manager} package(s) (${profile})…`),
    );
    const commandOptions = {
      manager,
      executable,
      run,
      which: whichFn,
    } satisfies LinuxCommandOptions;
    if (manager === "apt") {
      yield* tryPromise(() => runLinuxPackageCommand(commandOptions, "update"));
    }
    yield* tryPromise(() => runLinuxPackageCommand(commandOptions, "install", missing));
    yield* Console.log(
      ui.success(`Linux ${manager} sync complete; unrelated installed packages were preserved.`),
    );
  });
