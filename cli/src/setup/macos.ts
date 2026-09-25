import { join } from "node:path";

import { Console, Effect } from "effect";

import { configuredProfile, loadConfig, type ManagerConfig } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { runSetup, type SetupOptions } from "@/setup/run";
import { selectMacosByorProfile } from "@/source/contract";
import { ui } from "@/ui";
import { setupBrew } from "@/update/brew";
import { updateNix } from "@/update/nix";
import { ensureNixSymlinks } from "@/update/nix/symlinks";

export interface MacosSetupOptions extends SetupOptions {
  /** Inject a resolved config for tests or an embedding caller. */
  config?: ManagerConfig;
  /** BYOR macOS profile when the contract defines more than one. */
  profile?: string;
}

/** Resolve the optional Brewfile declared by the selected macOS profile. */
async function resolveMacosBrewfile(
  repoRoot: string,
  profile: string | undefined,
  config: ManagerConfig,
): Promise<string | undefined> {
  if (config.declarations === undefined) {
    throw new Error(`No profile declarations are configured in ${config.configPath}.`);
  }
  const selected = selectMacosByorProfile(config.declarations, profile);
  return selected.macos.brewfile === undefined
    ? undefined
    : join(repoRoot, selected.macos.brewfile);
}

/** Prepare and apply a repository's declared macOS configuration. */
export const runMacosSetup = (options: MacosSetupOptions = {}) =>
  Effect.gen(function* () {
    const { config: injectedConfig, profile, ...setupOptions } = options;
    const config =
      injectedConfig ??
      (yield* tryPromise(() =>
        loadConfig({
          stateRoot: setupOptions.stateRoot,
          configPath: setupOptions.configPath,
          machineId: setupOptions.machineId,
        }),
      ));
    const selectedProfile = configuredProfile(config, "macos", profile ?? setupOptions.repoProfile);
    const repo = yield* runSetup({
      ...setupOptions,
      repoProfile: selectedProfile,
      config,
      ensureSymlinks: options.ensureSymlinks ?? ensureNixSymlinks,
    });

    yield* Console.log(ui.heading("Applying macOS repository configuration…"));
    yield* updateNix({
      action: "switch",
      config,
      repo,
      profile: selectedProfile,
    });

    const brewfilePath = yield* tryPromise(() =>
      resolveMacosBrewfile(repo.root, selectedProfile, config),
    );
    if (brewfilePath === undefined) {
      yield* Console.log(ui.muted("No Brewfile declared; skipping Homebrew bundle."));
    } else {
      yield* setupBrew({
        config,
        brewfilePath,
      });
    }
    yield* Console.log(ui.success("macOS repository setup complete."));
  });
