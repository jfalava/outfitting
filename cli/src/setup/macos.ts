import { join } from "node:path";

import { Console, Effect } from "effect";

import { loadConfig, resolveOutfittingRepo, type ManagerConfig } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { runSetup, type SetupOptions } from "@/setup/run";
import { ui } from "@/ui";
import { setupBrew } from "@/update/brew";
import { updateNix } from "@/update/nix";
import { ensureNixSymlinks } from "@/update/nix/symlinks";

export interface MacosSetupOptions extends SetupOptions {
  /** Inject a resolved config for tests or an embedding caller. */
  config?: ManagerConfig;
}

/** Prepare and apply a repository's declared macOS configuration. */
export const runMacosSetup = (options: MacosSetupOptions = {}) =>
  Effect.gen(function* () {
    const { config: injectedConfig, ...setupOptions } = options;
    yield* runSetup({
      ...setupOptions,
      validateSource: true,
      ensureSymlinks: options.ensureSymlinks ?? ensureNixSymlinks,
    });

    const config =
      injectedConfig ??
      (yield* tryPromise(() =>
        loadConfig(options.stateRoot === undefined ? undefined : { stateRoot: options.stateRoot }),
      ));
    const repo = yield* tryPromise(() => resolveOutfittingRepo({ config }));

    yield* Console.log(ui.heading("Applying macOS repository configuration…"));
    yield* updateNix({ action: "switch", config, repo });
    yield* setupBrew({
      config,
      brewfilePath: join(repo.root, "packages/macos/Brewfile"),
    });
    yield* Console.log(ui.success("macOS repository setup complete."));
  });
