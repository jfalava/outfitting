import { Console, Effect } from "effect";

import type { ManagerConfig, OutfittingRepo } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand } from "@/process";
import { resolveSetupSource, runSetup, type SetupOptions } from "@/setup/run";
import { validateLinuxByorSource, type ValidatedLinuxByorProfile } from "@/source/contract";
import type { LinuxProfile } from "@/source/linux-profile";
import { ui } from "@/ui";
import { applyLinux, type LinuxApplyOptions } from "@/update/linux";
import { updateNix } from "@/update/nix";

export interface LinuxSetupOptions extends SetupOptions {
  profile?: LinuxProfile;
  packageManager?: LinuxApplyOptions["packageManager"];
  run?: LinuxApplyOptions["run"];
  which?: LinuxApplyOptions["which"];
  osReleasePath?: LinuxApplyOptions["osReleasePath"];
  readOsRelease?: LinuxApplyOptions["readOsRelease"];
}

export interface LinuxInitOptions extends SetupOptions {
  profile?: LinuxProfile;
}

/** Prepare Linux state and validate its configured source. */
export const runLinuxInit = (options: LinuxInitOptions) =>
  Effect.gen(function* () {
    const { profile, ...input } = options;
    const source = yield* tryPromise(() =>
      resolveSetupSource({ ...input, platform: "linux", repoProfile: profile }),
    );
    yield* runSetup({
      ...source,
      repoProfile: profile,
      nextCommand: "Next: outfitting-manager setup",
    });
  });

/** Prepare and apply the selected Linux BYOR package profile. */
export const runLinuxSetup = (options: LinuxSetupOptions) =>
  Effect.gen(function* () {
    const { profile, packageManager, run, which, osReleasePath, readOsRelease, ...input } = options;
    const sourceOptions: SetupOptions = {
      ...input,
      platform: "linux",
      repoProfile: profile,
      run,
    };
    const source = yield* tryPromise(() => resolveSetupSource(sourceOptions));
    const repo = yield* runSetup({
      ...sourceOptions,
      ...source,
      nextCommand: "Applying Linux package configuration…",
    });
    const config = source.config!;
    const selected = yield* tryPromise(() =>
      validateLinuxByorSource({
        root: repo.root,
        profile: source.repoProfile,
        contract: config.declarations!,
      }),
    );
    yield* applySelectedLinuxProfile({
      config,
      profile: selected.profile,
      selected,
      repo,
      packageManager,
      run: run ?? runCommand,
      which,
      osReleasePath,
      readOsRelease,
      offline: options.offline,
    });
  });

function applySelectedLinuxProfile(options: {
  config: ManagerConfig;
  profile: LinuxProfile;
  selected: ValidatedLinuxByorProfile;
  repo: OutfittingRepo;
  packageManager: LinuxSetupOptions["packageManager"];
  run: typeof runCommand;
  which: LinuxSetupOptions["which"];
  osReleasePath: LinuxSetupOptions["osReleasePath"];
  readOsRelease: LinuxSetupOptions["readOsRelease"];
  offline: boolean | undefined;
}) {
  return Effect.gen(function* () {
    const hasPackages =
      options.selected.linux.apt !== undefined || options.selected.linux.pacman !== undefined;
    if (hasPackages) {
      yield* applyLinux({
        config: options.config,
        profile: options.profile,
        packageManager: options.packageManager,
        run: options.run,
        which: options.which,
        osReleasePath: options.osReleasePath,
        readOsRelease: options.readOsRelease,
        offline: options.offline,
        noRefresh: true,
        sourceRoot: options.repo.root,
        yes: true,
      });
    }

    if (options.selected.linux.nix !== undefined) {
      yield* Console.log(ui.heading(`Applying ${options.profile} Nix/Home Manager configuration…`));
      yield* updateNix({
        action: "switch",
        config: options.config,
        profile: options.profile,
        repo: options.repo,
        noRefresh: true,
        noPush: true,
      });
    }
  });
}
