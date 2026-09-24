import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { readRepoPathFile, sparseSourceRoot, type ManagerConfig } from "@/config";
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

async function canonicalPath(path: string): Promise<string> {
  return realpath(isAbsolute(path) ? path : resolve(path)).catch(() => resolve(path));
}

async function samePath(left: string, right: string): Promise<boolean> {
  return (await canonicalPath(left)) === (await canonicalPath(right));
}

async function selectedLocalRoot(options: LinuxSourceOptions): Promise<string | undefined> {
  const explicit = options.sourceRoot ?? envValue("OUTFITTING_REPO");
  if (explicit !== undefined) {
    return explicit;
  }
  const saved = await readRepoPathFile(options.config);
  if (saved === undefined || (await samePath(saved, sparseSourceRoot(options.config.stateRoot)))) {
    return undefined;
  }
  return saved;
}

/** Use local checkouts directly; fetch only the BYOR map's remote snapshot. */
export async function prepareLinuxSource(options: LinuxSourceOptions): Promise<LinuxSource> {
  if (options.refresh === true && options.offline === true) {
    throw new Error("--refresh and --offline cannot be used together.");
  }
  const localRoot = await selectedLocalRoot(options);
  if (localRoot !== undefined) {
    const repo = await validateOutfittingRepo(localRoot, { profile: options.profile });
    await validateLinuxByorSource({ root: repo.root, profile: options.profile });
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
  const repo = await validateOutfittingRepo(source.root, { profile: options.profile });
  return { root: source.root, mode: "sparse", repo };
}

/** Read a Linux package declaration only from the selected validated BYOR source. */
export async function readLinuxManifest(
  config: ManagerConfig,
  profile: LinuxProfile,
  sourceRoot?: string,
  packageManager?: "apt" | "pacman",
): Promise<string> {
  const root =
    sourceRoot ??
    envValue("OUTFITTING_REPO") ??
    (await readRepoPathFile(config)) ??
    sparseSourceRoot(config.stateRoot);
  const absolute = await realpath(isAbsolute(root) ? root : resolve(root));
  const validated = await validateLinuxByorSource({ root: absolute, profile });
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
