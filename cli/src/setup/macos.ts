import { join } from "node:path";

import { Console, Effect } from "effect";

import { loadConfig, resolveOutfittingRepo, type ManagerConfig } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { runSetup, type SetupOptions } from "@/setup/run";
import { readByorContract, selectMacosByorProfile } from "@/source/contract";
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
): Promise<string | undefined> {
  const contract = await readByorContract(repoRoot);
  const selected = selectMacosByorProfile(contract, profile);
  return selected.macos.brewfile === undefined
    ? undefined
    : join(repoRoot, selected.macos.brewfile);
}

/** Prepare and apply a repository's declared macOS configuration. */
export const runMacosSetup = (options: MacosSetupOptions = {}) =>
  Effect.gen(function* () {
    const { config: injectedConfig, profile, ...setupOptions } = options;
    yield* runSetup({
      ...setupOptions,
      repoProfile: profile ?? setupOptions.repoProfile,
      ensureSymlinks: options.ensureSymlinks ?? ensureNixSymlinks,
    });

    const config =
      injectedConfig ??
      (yield* tryPromise(() =>
        loadConfig(options.stateRoot === undefined ? undefined : { stateRoot: options.stateRoot }),
      ));
    const repo = yield* tryPromise(() =>
      resolveOutfittingRepo({ config, profile: profile ?? setupOptions.repoProfile }),
    );

    yield* Console.log(ui.heading("Applying macOS repository configuration…"));
    yield* updateNix({
      action: "switch",
      config,
      repo,
      profile: profile ?? setupOptions.repoProfile,
    });

    const brewfilePath = yield* tryPromise(() =>
      resolveMacosBrewfile(repo.root, profile ?? setupOptions.repoProfile),
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
