import { Console, Effect } from "effect";

import { loadConfig, readRepoPathFile, saveConfigFile, type ManagerConfig } from "@/config";
import { isRemoteByorSource, remoteByorPlatform } from "@/fetch/github";
import { validateOutfittingRepo, type OutfittingRepo } from "@/config/repo";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand } from "@/process";
import { envValue } from "@/secrets";
import { linuxSourcePaths } from "@/setup/manifests";
import { runSetup, type SetupOptions } from "@/setup/run";
import {
  tryReadByorContract,
  validateLinuxByorSource,
  type ValidatedLinuxByorProfile,
} from "@/source/contract";
import { isBuiltInLinuxProfile } from "@/source/linux-profile";
import { ui } from "@/ui";
import {
  applyLinux,
  linuxManifestPath,
  runLinuxProfileBootstrap,
  type LinuxProfile,
  type LinuxApplyOptions,
} from "@/update/linux";
import { updateNix } from "@/update/nix";

export interface LinuxSetupOptions extends SetupOptions {
  profile: LinuxProfile;
  packageManager?: LinuxApplyOptions["packageManager"];
  run?: LinuxApplyOptions["run"];
  which?: LinuxApplyOptions["which"];
  osReleasePath?: LinuxApplyOptions["osReleasePath"];
  readOsRelease?: LinuxApplyOptions["readOsRelease"];
  bootstrapNix?: boolean;
}

export interface LinuxInitOptions extends SetupOptions {
  profile: LinuxProfile;
}

interface BuiltInSparsePaths {
  manifestPaths: string[];
  sourcePaths: ReadonlyArray<string>;
}

interface LinuxSourceContext {
  config: ManagerConfig;
  configuredRepo: string | undefined;
  byor: ValidatedLinuxByorProfile | undefined;
  sparse: BuiltInSparsePaths | undefined;
  /** Resolved Outfitting repo when a checkout is configured (BYOR or legacy markers). */
  outfittingRepo: OutfittingRepo | undefined;
}

function persistLinuxProfile(profile: LinuxProfile, stateRoot: string | undefined) {
  return tryPromise(() =>
    saveConfigFile({ linux: { profile } }, stateRoot === undefined ? undefined : { stateRoot }),
  );
}

function builtInSparsePaths(profile: LinuxProfile): BuiltInSparsePaths {
  if (!isBuiltInLinuxProfile(profile)) {
    throw new Error(
      `Profile \`${profile}\` is repository-defined; sparse setup requires outfitting.json or a built-in profile.`,
    );
  }
  return {
    manifestPaths: [linuxManifestPath(profile)],
    sourcePaths: linuxSourcePaths(profile),
  };
}

function loadStateConfig(stateRoot: string | undefined) {
  return tryPromise(() => loadConfig(stateRoot === undefined ? undefined : { stateRoot }));
}

/** Resolve repo path, BYOR contract, and sparse paths once for init/setup. */
function resolveLinuxSourceContext(options: {
  stateRoot?: string;
  repo?: string;
  profile: LinuxProfile;
  remoteByor?: boolean;
}): Effect.Effect<LinuxSourceContext, unknown> {
  return Effect.gen(function* () {
    const config = yield* loadStateConfig(options.stateRoot);
    const configuredRepo =
      options.repo ??
      envValue("OUTFITTING_REPO") ??
      (yield* tryPromise(() => readRepoPathFile(config)));

    if (configuredRepo === undefined) {
      return {
        config,
        configuredRepo: undefined,
        byor: undefined,
        sparse:
          options.remoteByor || isRemoteByorSource(config.manifest.baseUrl)
            ? undefined
            : builtInSparsePaths(options.profile),
        outfittingRepo: undefined,
      };
    }

    const contract = yield* tryPromise(() => tryReadByorContract(configuredRepo));
    if (contract !== undefined) {
      const byor = yield* tryPromise(() =>
        validateLinuxByorSource({ root: configuredRepo, profile: options.profile }),
      );
      const outfittingRepo = yield* tryPromise(() =>
        validateOutfittingRepo(byor.root, { profile: byor.profile }),
      );
      return {
        config,
        configuredRepo: byor.root,
        byor,
        sparse: undefined,
        outfittingRepo,
      };
    }

    const outfittingRepo = yield* tryPromise(() =>
      validateOutfittingRepo(configuredRepo, { profile: options.profile }),
    );
    return {
      config,
      configuredRepo,
      byor: undefined,
      sparse: builtInSparsePaths(options.profile),
      outfittingRepo,
    };
  });
}

function applyLinuxSetup(options: {
  config: ManagerConfig;
  profile: LinuxProfile;
  byor: ValidatedLinuxByorProfile | undefined;
  outfittingRepo: OutfittingRepo | undefined;
  packageManager: LinuxSetupOptions["packageManager"];
  which: LinuxSetupOptions["which"];
  osReleasePath: LinuxSetupOptions["osReleasePath"];
  readOsRelease: LinuxSetupOptions["readOsRelease"];
  offline: boolean | undefined;
  bootstrapNix: boolean | undefined;
  commandRunner: typeof runCommand;
}) {
  return Effect.gen(function* () {
    const hasNativePackages =
      options.byor === undefined ||
      options.byor.linux.apt !== undefined ||
      options.byor.linux.pacman !== undefined;
    if (hasNativePackages) {
      yield* applyLinux({
        config: options.config,
        profile: options.profile,
        packageManager: options.packageManager,
        run: options.commandRunner,
        which: options.which,
        osReleasePath: options.osReleasePath,
        readOsRelease: options.readOsRelease,
        offline: options.offline,
        noRefresh: true,
        yes: true,
      });
    }

    if (options.bootstrapNix === false) {
      return;
    }

    if (options.byor?.linux.nix !== undefined) {
      yield* Console.log(ui.heading(`Applying ${options.profile} Nix/Home Manager configuration…`));
      yield* updateNix({
        action: "switch",
        config: options.config,
        profile: options.profile,
        // Reuse the already-validated flake selection; do not re-fetch source.
        repo: options.outfittingRepo,
        noRefresh: true,
        noPush: true,
      });
      return;
    }

    if (
      options.byor === undefined &&
      isBuiltInLinuxProfile(options.profile) &&
      options.profile !== "generic-linux"
    ) {
      yield* Console.log(ui.heading(`Applying ${options.profile} Nix/Home Manager configuration…`));
      yield* tryPromise(() =>
        runLinuxProfileBootstrap(options.profile, options.config, options.commandRunner),
      );
    }
  });
}

/** Prepare Linux state and validate/persist its selected source without applying it. */
export const runLinuxInit = (options: LinuxInitOptions) =>
  Effect.gen(function* () {
    const { profile, repo, ...setupOptions } = options;
    const source = yield* resolveLinuxSourceContext({
      stateRoot: options.stateRoot,
      repo,
      profile,
      remoteByor: setupOptions.remoteByor !== undefined,
    });

    const linuxSetupOptions: SetupOptions = {
      ...setupOptions,
      manifestPaths: source.byor === undefined ? source.sparse?.manifestPaths : undefined,
      sourcePaths: source.byor === undefined ? source.sparse?.sourcePaths : undefined,
      remoteByor:
        source.configuredRepo === undefined
          ? (setupOptions.remoteByor ??
            remoteByorPlatform("linux", source.config.manifest.baseUrl, undefined))
          : undefined,
      fetchManifests: source.byor !== undefined ? false : setupOptions.fetchManifests,
      repoProfile: profile,
      nextCommand: "Next: outfitting-manager setup",
    };
    if (source.configuredRepo !== undefined) {
      linuxSetupOptions.repo = source.configuredRepo;
      linuxSetupOptions.remoteByor = undefined;
    }
    yield* runSetup(linuxSetupOptions);
    yield* persistLinuxProfile(profile, options.stateRoot);
  });

/** Prepare and apply the selected Linux package profile. */
export const runLinuxSetup = (options: LinuxSetupOptions) =>
  Effect.gen(function* () {
    const {
      profile,
      packageManager,
      run,
      which,
      osReleasePath,
      readOsRelease,
      bootstrapNix,
      ...setupOptions
    } = options;
    const source = yield* resolveLinuxSourceContext({
      stateRoot: options.stateRoot,
      repo: setupOptions.repo,
      profile,
      remoteByor: setupOptions.remoteByor !== undefined,
    });

    const setupArgs: SetupOptions = {
      ...setupOptions,
      manifestPaths: source.byor === undefined ? source.sparse?.manifestPaths : undefined,
      sourcePaths: source.byor === undefined ? source.sparse?.sourcePaths : undefined,
      remoteByor:
        source.configuredRepo === undefined
          ? (setupOptions.remoteByor ??
            remoteByorPlatform("linux", source.config.manifest.baseUrl, undefined))
          : undefined,
      fetchManifests: source.byor !== undefined ? false : setupOptions.fetchManifests,
      repoProfile: profile,
      nextCommand: "Applying Linux package configuration…",
    };
    if (source.configuredRepo !== undefined) {
      setupArgs.repo = source.configuredRepo;
      setupArgs.remoteByor = undefined;
    }
    yield* runSetup(setupArgs);
    yield* persistLinuxProfile(profile, options.stateRoot);

    // runSetup may rewrite config/repo-path; reload before apply.
    const config = yield* loadStateConfig(options.stateRoot);
    yield* applyLinuxSetup({
      config,
      profile,
      byor: source.byor,
      outfittingRepo: source.outfittingRepo,
      packageManager,
      which,
      osReleasePath,
      readOsRelease,
      offline: setupOptions.offline,
      bootstrapNix,
      commandRunner: run ?? runCommand,
    });
  });
