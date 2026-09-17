import { join } from "node:path";

import { Console, Effect } from "effect";

import { loadConfig, resolveOutfittingRepo, type ManagerConfig } from "@/config";
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

export const LINUX_PROFILES = ["generic-linux", "oci-agents"] as const;
export type LinuxProfile = (typeof LINUX_PROFILES)[number];

export const LINUX_MANIFEST_PATH = "packages/linux/{profile}.txt";

export function isLinuxProfile(value: string): value is LinuxProfile {
  return (LINUX_PROFILES as ReadonlyArray<string>).includes(value);
}

export function linuxManifestPath(profile: LinuxProfile): string {
  return LINUX_MANIFEST_PATH.replace("{profile}", profile);
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

export type LinuxPackageAction = "update" | "upgrade" | "install" | "remove";

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
    case "remove":
      return ["remove", "-y", ...packages];
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
    case "remove":
      return ["-Rns", "--noconfirm", ...packages];
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
  if ((action === "install" || action === "remove") && packages.length === 0) {
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
  /** Disable the OCI bootstrap for tests or callers that only want packages. */
  bootstrapOci?: boolean;
}

function resolveProfile(value: string | undefined): LinuxProfile {
  const profile = value ?? "generic-linux";
  if (!isLinuxProfile(profile)) {
    throw new Error(`Unknown Linux profile \`${profile}\`. Choose: ${LINUX_PROFILES.join(", ")}.`);
  }
  return profile;
}

async function runOciBootstrap(config: ManagerConfig, run: typeof runCommand): Promise<void> {
  const repo = await resolveOutfittingRepo({ config });
  const script = join(repo.root, "system", "oci-agents", "bootstrap.sh");
  const result = await run("bash", [script], { cwd: repo.root, inherit: true });
  if (result.code !== 0) {
    throw new Error(`OCI bootstrap failed (exit ${result.code}).`);
  }
}

/** Update native Linux packages, optionally followed by the explicit OCI profile bootstrap. */
export const updateLinux = (options: LinuxUpdateOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    const whichFn = options.which ?? which;
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const profile = yield* Effect.try({
      try: () => resolveProfile(options.profile),
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
    const packages = yield* Effect.try({
      try: () => parseLinuxPackageManifest(manifest.text),
      catch: toCliFailure,
    });
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
    if (packages.length > 0) {
      yield* Console.log(ui.heading(`Installing ${packages.length} managed package(s)…`));
      yield* tryPromise(() => runLinuxPackageCommand(commandOptions, "install", packages));
    }

    if (profile === "oci-agents" && options.bootstrapOci !== false) {
      yield* Console.log(ui.heading("Applying oci-agents Nix/Home Manager services…"));
      yield* tryPromise(() => runOciBootstrap(config, run));
    }

    yield* Console.log(ui.success(`Linux ${manager} update complete.`));
  });

export { runLinuxPackageCommand };
