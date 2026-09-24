import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Console, Effect } from "effect";

import { loadConfig, resolveOutfittingRepo, type ManagerConfig } from "@/config";
import { CliFailure } from "@/errors";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which } from "@/process";
import { readByorContract, selectMacosByorProfile } from "@/source/contract";
import { ui } from "@/ui";
import { pushHomebrewInventory } from "@/update/snapshot";

export interface BrewfileManifest {
  taps: string[];
  formulae: string[];
  casks: string[];
}

/** Parse the direct Homebrew entries understood by the manager. */
export function parseBrewfileManifest(brewfile: string): BrewfileManifest {
  const manifest: BrewfileManifest = { taps: [], formulae: [], casks: [] };
  const seen = {
    taps: new Set<string>(),
    formulae: new Set<string>(),
    casks: new Set<string>(),
  };
  const pattern = /^\s*(tap|brew|cask)\s+['"]([^'"]+)['"]/gm;

  for (const match of brewfile.matchAll(pattern)) {
    const kind = match[1];
    const name = match[2]?.trim();
    if (name === undefined || name.length === 0) {
      continue;
    }
    const key = kind === "tap" ? "taps" : kind === "brew" ? "formulae" : "casks";
    if (seen[key].has(name.toLowerCase())) {
      continue;
    }
    seen[key].add(name.toLowerCase());
    manifest[key].push(name);
  }

  return manifest;
}

/** Extract tap names from Brewfile lines like `tap "owner/name", trusted: true`. */
export function parseBrewfileTaps(brewfile: string): string[] {
  return parseBrewfileManifest(brewfile).taps;
}

async function trustTaps(taps: ReadonlyArray<string>, run: typeof runCommand): Promise<void> {
  for (const tap of taps) {
    const result = await run("brew", ["trust", "--tap", tap], { inherit: false });
    const output = `${result.stdout}${result.stderr}`.trim();
    if (!output.includes("Already trusted") && output.length > 0) {
      console.log(output);
    }
  }
}

async function resolveBrewfile(
  options: Pick<UpdateBrewOptions, "brewfilePath" | "profile">,
  config: ManagerConfig,
): Promise<{ path: string; text: string }> {
  if (options.brewfilePath !== undefined) {
    return {
      path: options.brewfilePath,
      text: await readFile(options.brewfilePath, "utf8"),
    };
  }
  const repo = await resolveOutfittingRepo({ config, profile: options.profile });
  const contract = await readByorContract(repo.root);
  const selected = selectMacosByorProfile(contract, options.profile);
  if (selected.macos.brewfile === undefined) {
    throw new Error(`BYOR macOS profile \`${selected.name}\` does not declare a Brewfile.`);
  }
  const path = join(repo.root, selected.macos.brewfile);
  return { path, text: await readFile(path, "utf8") };
}

export interface UpdateBrewOptions {
  config?: ManagerConfig;
  /** Skip inventory push after success. */
  noPush?: boolean;
  /** Override the Brewfile selected by the repository contract. */
  brewfilePath?: string;
  profile?: string;
  /** Injected for tests. */
  run?: typeof runCommand;
  which?: typeof which;
}

/**
 * First-run Homebrew apply: install missing declarations without upgrading or removing.
 */
export const setupBrew = (options: UpdateBrewOptions = {}) =>
  Effect.gen(function* () {
    const whichFn = options.which ?? which;
    const run = options.run ?? runCommand;
    const brewPath = yield* tryPromise(() => whichFn("brew"));
    if (brewPath === undefined) {
      return yield* new CliFailure({ message: "Homebrew is not installed or not in PATH." });
    }

    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    yield* Console.log(ui.heading("Reading selected Homebrew Brewfile…"));
    const brewfile = yield* tryPromise(() => resolveBrewfile(options, config));

    const taps = parseBrewfileTaps(brewfile.text);
    if (taps.length > 0) {
      yield* Console.log(ui.muted(`Trusting ${taps.length} tap(s)…`));
      yield* tryPromise(() => trustTaps(taps, run));
    }

    yield* Console.log(ui.heading("Syncing Homebrew manifest…"));
    const bundle = yield* tryPromise(() =>
      run("brew", ["bundle", "--no-upgrade", `--file=${brewfile.path}`], { inherit: true }),
    );
    if (bundle.code !== 0) {
      return yield* new CliFailure({ message: `brew bundle failed (exit ${bundle.code}).` });
    }

    yield* Console.log(ui.success("Homebrew setup complete."));
  });

/** Upgrade installed Homebrew packages without applying or pruning declarations. */
export const updateBrew = (options: UpdateBrewOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    if ((yield* tryPromise(() => (options.which ?? which)("brew"))) === undefined) {
      return yield* new CliFailure({ message: "Homebrew is not installed or not in PATH." });
    }
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    yield* requireBrewOk(run, ["update"], "brew update");
    yield* requireBrewOk(run, ["upgrade"], "brew upgrade");
    yield* requireBrewOk(run, ["upgrade", "--cask"], "brew upgrade --cask");
    yield* pushHomebrewInventory({ config, run, noPush: options.noPush });
    yield* Console.log(ui.success("Homebrew update complete."));
  });

const requireBrewOk = (run: typeof runCommand, args: ReadonlyArray<string>, label: string) =>
  Effect.gen(function* () {
    yield* Console.log(ui.heading(`${label}…`));
    const result = yield* tryPromise(() => run("brew", args, { inherit: true }));
    if (result.code !== 0) {
      return yield* new CliFailure({ message: `${label} failed (exit ${result.code}).` });
    }
  });
