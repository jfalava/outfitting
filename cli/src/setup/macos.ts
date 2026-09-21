import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

import { Console, Effect } from "effect";

import { loadConfig, resolveOutfittingRepo, type ManagerConfig } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { runSetup, type SetupOptions } from "@/setup/run";
import {
  byorContractPlatforms,
  selectMacosByorProfile,
  tryReadByorContract,
} from "@/source/contract";
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

const LEGACY_BREWFILE = "packages/macos/Brewfile";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolve brewfile path from BYOR contract or legacy monorepo layout. */
async function resolveMacosBrewfile(
  repoRoot: string,
  profile: string | undefined,
): Promise<string | undefined> {
  const contract = await tryReadByorContract(repoRoot);
  if (contract !== undefined && byorContractPlatforms(contract).macos) {
    const selected = selectMacosByorProfile(contract, profile);
    if (selected.macos.brewfile === undefined) {
      return undefined;
    }
    return join(repoRoot, selected.macos.brewfile);
  }
  const legacy = join(repoRoot, LEGACY_BREWFILE);
  return (await pathExists(legacy)) ? legacy : undefined;
}

/** Prepare and apply a repository's declared macOS configuration. */
export const runMacosSetup = (options: MacosSetupOptions = {}) =>
  Effect.gen(function* () {
    const { config: injectedConfig, profile, ...setupOptions } = options;
    yield* runSetup({
      ...setupOptions,
      repoProfile: profile ?? setupOptions.repoProfile,
      validateSource: true,
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
    yield* updateNix({ action: "switch", config, repo });

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
