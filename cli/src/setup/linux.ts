import { Console, Effect } from "effect";

import { loadConfig } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand } from "@/process";
import { runSetup, type SetupOptions } from "@/setup/run";
import { ui } from "@/ui";
import {
  linuxManifestPath,
  runLinuxOciBootstrap,
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
  bootstrapOci?: LinuxUpdateOptions["bootstrapOci"];
}

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
      bootstrapOci,
      ...setupOptions
    } = options;

    yield* runSetup({
      ...setupOptions,
      manifestPaths: [linuxManifestPath(profile)],
      nextCommand: "Applying Linux package configuration…",
    });

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

    if (profile === "oci-agents" && bootstrapOci !== false) {
      yield* Console.log(ui.heading("Applying oci-agents Nix/Home Manager services…"));
      yield* tryPromise(() => runLinuxOciBootstrap(config, commandRunner));
    }
  });
