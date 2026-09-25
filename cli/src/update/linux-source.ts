import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { configuredProfile, type ManagerConfig } from "@/config";
import { validateOutfittingRepo, type OutfittingRepo } from "@/config/repo";
import type { ManifestFetcher } from "@/fetch/github";
import { runCommand } from "@/process";
import { envValue } from "@/secrets";
import { syncByorSparseSource } from "@/setup/source";
import { validateLinuxByorSource } from "@/source/contract";
import type { LinuxProfile } from "@/source/linux-profile";

export { isLinuxProfile, type LinuxProfile } from "@/source/linux-profile";

export interface LinuxSourceOptions {
  config: ManagerConfig;
  profile: LinuxProfile;
  sourceRoot?: string;
  refresh?: boolean;
  offline?: boolean;
  fetcher?: ManifestFetcher;
  run?: typeof runCommand;
}

export interface LinuxSource {
  root: string;
  mode: "sparse" | "checkout";
  repo: OutfittingRepo;
}

async function selectedLocalRoot(config: ManagerConfig): Promise<string | undefined> {
  return (
    envValue("OUTFITTING_REPO") ??
    (config.source?.kind === "local" ? config.source.path : undefined)
  );
}

/** Use local checkouts directly; otherwise fetch the TOML-declared remote source. */
export async function prepareLinuxSource(options: LinuxSourceOptions): Promise<LinuxSource> {
  if (options.refresh === true && options.offline === true) {
    throw new Error("--refresh and --offline cannot be used together.");
  }
  const localRoot = await selectedLocalRoot(options.config);
  if (localRoot !== undefined) {
    if (options.config.declarations === undefined) {
      throw new Error(`No profile declarations are configured in ${options.config.configPath}.`);
    }
    const repo = await validateOutfittingRepo(localRoot, {
      profile: options.profile,
      contract: options.config.declarations,
    });
    await validateLinuxByorSource({
      root: repo.root,
      profile: options.profile,
      contract: options.config.declarations,
    });
    return { root: repo.root, mode: "checkout", repo };
  }

  const source = await syncByorSparseSource({
    config: options.config,
    platform: "linux",
    profile: options.profile,
    sourceRoot: options.sourceRoot,
    fetcher: options.fetcher,
    run: options.run,
    offline: options.offline === true || options.refresh !== true,
  });
  const repo = await validateOutfittingRepo(source.root, {
    profile: options.profile,
    contract: options.config.declarations!,
  });
  return { root: source.root, mode: "sparse", repo };
}

/** Read a Linux package declaration from the selected validated TOML source. */
export async function readLinuxManifest(
  config: ManagerConfig,
  profile: LinuxProfile,
  sourceRoot?: string,
  packageManager?: "apt" | "pacman",
): Promise<string> {
  const selectedProfile = configuredProfile(config, "linux", profile) ?? profile;
  if (config.declarations === undefined) {
    throw new Error(`No profile declarations are configured in ${config.configPath}.`);
  }
  let root = sourceRoot ?? (await selectedLocalRoot(config));
  if (root === undefined) {
    const source = await syncByorSparseSource({
      config,
      platform: "linux",
      profile: selectedProfile,
      sourceRoot,
      offline: true,
    });
    root = source.root;
  }
  const absolute = await realpath(isAbsolute(root) ? root : resolve(root));
  const validated = await validateLinuxByorSource({
    root: absolute,
    profile: selectedProfile,
    contract: config.declarations,
  });
  const manager =
    packageManager ??
    (["apt", "pacman"] as const).find((candidate) => validated.linux[candidate] !== undefined);
  if (manager === undefined || validated.linux[manager] === undefined) {
    throw new Error(
      `BYOR profile \`${profile}\` does not declare a ${packageManager ?? "native"} package manifest.`,
    );
  }
  return readFile(join(absolute, validated.linux[manager].manifest), "utf8");
}
