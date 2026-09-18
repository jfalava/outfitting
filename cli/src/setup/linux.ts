import { Console, Effect } from "effect";

import {
  loadConfig,
  saveConfigFile,
  syncOutfittingRepo,
  tryResolveOutfittingRepo,
  writeRepoPath,
} from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand } from "@/process";
import { envValue } from "@/secrets";
import { linuxSourcePaths } from "@/setup/manifests";
import { runSetup, type SetupOptions } from "@/setup/run";
import { ui } from "@/ui";
import {
  linuxManifestPath,
  runLinuxProfileBootstrap,
  syncLinux,
  type LinuxProfile,
  type LinuxUpdateOptions,
} from "@/update/linux";

export interface LinuxSetupOptions extends SetupOptions {
  profile: LinuxProfile;
  packageManager?: LinuxUpdateOptions["packageManager"];
  run?: LinuxUpdateOptions["run"];
  which?: LinuxUpdateOptions["which"];
  osReleasePath?: LinuxUpdateOptions["osReleasePath"];
  readOsRelease?: LinuxUpdateOptions["readOsRelease"];
  bootstrapNix?: LinuxUpdateOptions["bootstrapNix"];
}

export interface LinuxInitOptions extends SetupOptions {
  profile: LinuxProfile;
  run?: LinuxUpdateOptions["run"];
  bootstrapNix?: LinuxUpdateOptions["bootstrapNix"];
}

function persistLinuxProfile(profile: LinuxProfile, stateRoot: string | undefined) {
  return tryPromise(() =>
    saveConfigFile(
      { linux: { profile } },
      stateRoot === undefined ? undefined : { stateRoot },
    ),
  );
}

/** Prepare Linux state and bootstrap the selected profile's Nix configuration. */
export const runLinuxInit = (options: LinuxInitOptions) =>
  Effect.gen(function* () {
    const { profile, repo, run, bootstrapNix, ...setupOptions } = options;
    const envRepo = envValue("OUTFITTING_REPO");
    const configuredRepo = repo ?? envRepo;

    const linuxSetupOptions: SetupOptions = {
      ...setupOptions,
      manifestPaths: [linuxManifestPath(profile)],
      sourcePaths: linuxSourcePaths(profile),
      nextCommand: "Next: outfitting-manager setup",
    };
    if (configuredRepo !== undefined) {
      linuxSetupOptions.repo = configuredRepo;
    }
    yield* runSetup(linuxSetupOptions);
    yield* persistLinuxProfile(profile, options.stateRoot);

    if (profile !== "generic-linux" && bootstrapNix !== false) {
      const config = yield* tryPromise(() =>
        loadConfig(options.stateRoot === undefined ? undefined : { stateRoot: options.stateRoot }),
      );
      if (configuredRepo !== undefined) {
        const syncedRepo = yield* tryPromise(() =>
          syncOutfittingRepo(configuredRepo, { ref: config.manifest.ref, run: run ?? runCommand }),
        );
        yield* tryPromise(() => writeRepoPath(syncedRepo.root, { stateRoot: config.stateRoot }));
      } else {
        const sourceRepo = yield* tryPromise(() => tryResolveOutfittingRepo({ config }));
        if (sourceRepo === undefined) {
          throw new Error(
            "Linux Nix source is not configured. Run init without --no-fetch or pass --repo.",
          );
        }
      }
      yield* Console.log(ui.heading(`Applying ${profile} Nix/Home Manager configuration…`));
      yield* tryPromise(() => runLinuxProfileBootstrap(profile, config, run ?? runCommand));
    }
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

    yield* runSetup({
      ...setupOptions,
      manifestPaths: [linuxManifestPath(profile)],
      sourcePaths: linuxSourcePaths(profile),
      nextCommand: "Applying Linux package configuration…",
    });
    yield* persistLinuxProfile(profile, options.stateRoot);

    const config = yield* tryPromise(() =>
      loadConfig(options.stateRoot === undefined ? undefined : { stateRoot: options.stateRoot }),
    );
    const commandRunner = run ?? runCommand;
    yield* syncLinux({
      config,
      profile,
      packageManager,
      run: commandRunner,
      which,
      osReleasePath,
      readOsRelease,
      fetcher: setupOptions.fetcher,
      // runSetup has already populated the cache; setup must apply that exact source.
      offline: true,
    });

    if (profile !== "generic-linux" && bootstrapNix !== false) {
      yield* Console.log(ui.heading(`Applying ${profile} Nix/Home Manager configuration…`));
      yield* tryPromise(() => runLinuxProfileBootstrap(profile, config, commandRunner));
    }
  });