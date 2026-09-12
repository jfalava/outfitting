import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Console, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { fetchManifest } from "@/fetch";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which } from "@/process";
import { pushHomebrewInventory } from "@/update/snapshot";
import { ui } from "@/ui";

export const BREWFILE_MANIFEST_PATH = "packages/macos/Brewfile";

/** Extract tap names from Brewfile lines like `tap "owner/name", trusted: true`. */
export function parseBrewfileTaps(brewfile: string): string[] {
  const taps: string[] = [];
  const pattern = /^\s*tap\s+['"]([^'"]+)['"]/gm;
  for (const match of brewfile.matchAll(pattern)) {
    const name = match[1];
    if (name !== undefined && name.length > 0) {
      taps.push(name);
    }
  }
  return taps;
}

async function trustTaps(
  taps: ReadonlyArray<string>,
  run: typeof runCommand,
): Promise<void> {
  for (const tap of taps) {
    const result = await run("brew", ["trust", "--tap", tap], { inherit: false });
    const output = `${result.stdout}${result.stderr}`.trim();
    if (!output.includes("Already trusted") && output.length > 0) {
      console.log(output);
    }
  }
}

async function writeBrewfile(config: ManagerConfig, contents: string): Promise<string> {
  const dir = join(config.stateRoot, "manifests", "packages", "macos");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "Brewfile");
  await writeFile(path, contents, "utf8");
  return path;
}

export interface UpdateBrewOptions {
  config?: ManagerConfig;
  /** Skip inventory push after success. */
  noSync?: boolean;
  /** Injected for tests. */
  run?: typeof runCommand;
  which?: typeof which;
}

/**
 * Full Homebrew path: fetch Brewfile → trust taps → bundle → upgrade → cleanup.
 */
export const updateBrew = (options: UpdateBrewOptions = {}) =>
  Effect.gen(function* () {
    const whichFn = options.which ?? which;
    const run = options.run ?? runCommand;
    const brewPath = yield* tryPromise(() => whichFn("brew"));
    if (brewPath === undefined) {
      return yield* Effect.fail(new Error("Homebrew is not installed or not in PATH."));
    }

    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    yield* Console.log(ui.heading("Fetching Homebrew Brewfile…"));
    const manifest = yield* tryPromise(() =>
      fetchManifest({
        path: BREWFILE_MANIFEST_PATH,
        config,
        materialize: true,
      }),
    );
    if (manifest.warning) {
      yield* Console.log(ui.muted(manifest.warning));
    }
    const brewfilePath =
      manifest.materializedPath ??
      (yield* tryPromise(() => writeBrewfile(config, manifest.text)));

    const taps = parseBrewfileTaps(manifest.text);
    if (taps.length > 0) {
      yield* Console.log(ui.muted(`Trusting ${taps.length} tap(s)…`));
      yield* tryPromise(() => trustTaps(taps, run));
    }

    yield* Console.log(ui.heading("Syncing Homebrew manifest…"));
    const bundle = yield* tryPromise(() =>
      run("brew", ["bundle", `--file=${brewfilePath}`], { inherit: true }),
    );
    if (bundle.code !== 0) {
      return yield* Effect.fail(new Error(`brew bundle failed (exit ${bundle.code}).`));
    }

    yield* requireBrewOk(run, ["upgrade"], "brew upgrade");
    yield* requireBrewOk(run, ["upgrade", "--cask"], "brew upgrade --cask");
    yield* requireBrewOk(
      run,
      ["bundle", "cleanup", `--file=${brewfilePath}`, "--cask", "--force"],
      "brew bundle cleanup",
    );

    yield* Console.log(ui.success("Homebrew update complete."));

    if (!options.noSync) {
      yield* pushHomebrewInventory({ config, run });
    } else {
      yield* Console.log(ui.muted("Skipped inventory sync (--no-sync)."));
    }
  });

const requireBrewOk = (
  run: typeof runCommand,
  args: ReadonlyArray<string>,
  label: string,
) =>
  Effect.gen(function* () {
    yield* Console.log(ui.heading(`${label}…`));
    const result = yield* tryPromise(() => run("brew", args, { inherit: true }));
    if (result.code !== 0) {
      return yield* Effect.fail(new Error(`${label} failed (exit ${result.code}).`));
    }
  });
