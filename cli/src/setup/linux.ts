import { Console, Effect } from "effect";

import { loadConfig, readRepoPathFile, saveConfigFile } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand } from "@/process";
import { envValue } from "@/secrets";
import { linuxSourcePaths } from "@/setup/manifests";
import { runSetup, type SetupOptions } from "@/setup/run";
import {
  hasByorContract,
  validateLinuxByorSource,
  type ValidatedLinuxByorProfile,
} from "@/source/contract";
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

function persistLinuxProfile(profile: LinuxProfile, stateRoot: string | undefined) {
  return tryPromise(() =>
    saveConfigFile({ linux: { profile } }, stateRoot === undefined ? undefined : { stateRoot }),
  );
}

function applyLinuxSetup(options: {
  config: Awaited<ReturnType<typeof loadConfig>>;
  profile: LinuxProfile;
  byor: ValidatedLinuxByorProfile | undefined;
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

    if (options.byor?.linux.nix !== undefined && options.bootstrapNix !== false) {
      yield* Console.log(ui.heading(`Applying ${options.profile} Nix/Home Manager configuration…`));
      yield* updateNix({
        action: "switch",
        config: options.config,
        profile: options.profile,
        noRefresh: true,
        noPush: true,
      });
    } else if (
      options.byor === undefined &&
      options.profile !== "generic-linux" &&
      options.bootstrapNix !== false
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
    const envRepo = envValue("OUTFITTING_REPO");
    const initialConfig = yield* tryPromise(() =>
      loadConfig(options.stateRoot === undefined ? undefined : { stateRoot: options.stateRoot }),
    );
    const configuredRepo =
      repo ?? envRepo ?? (yield* tryPromise(() => readRepoPathFile(initialConfig)));
    const custom =
      configuredRepo !== undefined && (yield* tryPromise(() => hasByorContract(configuredRepo)));
    if (custom) {
      yield* tryPromise(() => validateLinuxByorSource({ root: configuredRepo!, profile }));
    }

    const linuxSetupOptions: SetupOptions = {
      ...setupOptions,
      manifestPaths: custom ? undefined : [linuxManifestPath(profile)],
      sourcePaths: custom ? undefined : linuxSourcePaths(profile),
      fetchManifests: custom ? false : setupOptions.fetchManifests,
      repoProfile: profile,
      nextCommand: "Next: outfitting-manager setup",
    };
    if (configuredRepo !== undefined) {
      linuxSetupOptions.repo = configuredRepo;
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
    const initialConfig = yield* tryPromise(() =>
      loadConfig(options.stateRoot === undefined ? undefined : { stateRoot: options.stateRoot }),
    );
    const configuredRepo =
      setupOptions.repo ??
      envValue("OUTFITTING_REPO") ??
      (yield* tryPromise(() => readRepoPathFile(initialConfig)));
    const custom =
      configuredRepo !== undefined && (yield* tryPromise(() => hasByorContract(configuredRepo)));
    const byor = custom
      ? yield* tryPromise(() => validateLinuxByorSource({ root: configuredRepo!, profile }))
      : undefined;

    yield* runSetup({
      ...setupOptions,
      manifestPaths: custom ? undefined : [linuxManifestPath(profile)],
      sourcePaths: custom ? undefined : linuxSourcePaths(profile),
      fetchManifests: custom ? false : setupOptions.fetchManifests,
      repoProfile: profile,
      nextCommand: "Applying Linux package configuration…",
    });
    yield* persistLinuxProfile(profile, options.stateRoot);

    const config = yield* tryPromise(() =>
      loadConfig(options.stateRoot === undefined ? undefined : { stateRoot: options.stateRoot }),
    );
    const commandRunner = run ?? runCommand;
    yield* applyLinuxSetup({
      config,
      profile,
      byor,
      packageManager,
      which,
      osReleasePath,
      readOsRelease,
      offline: setupOptions.offline,
      bootstrapNix,
      commandRunner,
    });
  });
