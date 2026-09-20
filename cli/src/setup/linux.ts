import { Console, Effect } from "effect";

import { loadConfig, saveConfigFile } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand } from "@/process";
import { envValue } from "@/secrets";
import { linuxSourcePaths } from "@/setup/manifests";
import { runSetup, type SetupOptions } from "@/setup/run";
import { ui } from "@/ui";
import {
  applyLinux,
  linuxManifestPath,
  runLinuxProfileBootstrap,
  type LinuxProfile,
  type LinuxApplyOptions,
} from "@/update/linux";

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

/** Prepare Linux state and validate/persist its selected source without applying it. */
export const runLinuxInit = (options: LinuxInitOptions) =>
  Effect.gen(function* () {
    const { profile, repo, ...setupOptions } = options;
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
    yield* applyLinux({
      config,
      profile,
      packageManager,
      run: commandRunner,
      which,
      osReleasePath,
      readOsRelease,
      // runSetup has already populated the local source; offline also constrains package downloads.
      offline: setupOptions.offline,
      yes: true,
    });

    if (profile !== "generic-linux" && bootstrapNix !== false) {
      yield* Console.log(ui.heading(`Applying ${profile} Nix/Home Manager configuration…`));
      yield* tryPromise(() => runLinuxProfileBootstrap(profile, config, commandRunner));
    }
  });
