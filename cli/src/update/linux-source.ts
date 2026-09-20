import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { readRepoPathFile, sparseSourceRoot, type ManagerConfig } from "@/config";
import { manifestsDir } from "@/config/paths";
import { validateOutfittingRepo, type OutfittingRepo } from "@/config/repo";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { runCommand } from "@/process";
import { envValue } from "@/secrets";
import { linuxSourcePaths } from "@/setup/manifests";
import { syncSparseSource } from "@/setup/source";

export const LINUX_PROFILES = ["generic-linux", "oci-agents", "ubuntu-wsl"] as const;
export type LinuxProfile = (typeof LINUX_PROFILES)[number];

const LINUX_PROFILE_MANIFEST_PATHS = {
  "generic-linux": "packages/linux/generic-linux.txt",
  "oci-agents": "packages/linux/oci-agents.txt",
  "ubuntu-wsl": "packages/ubuntu-wsl/apt.txt",
} satisfies Record<LinuxProfile, string>;

export interface LinuxSourceOptions {
  config: ManagerConfig;
  profile: LinuxProfile;
  /** Override configured source selection for internal callers with a resolved repo. */
  sourceRoot?: string;
  refresh?: boolean;
  offline?: boolean;
  fetcher?: ManifestFetcher;
  run?: typeof runCommand;
}

export interface LinuxSource {
  root: string;
  mode: "sparse" | "checkout";
  repo?: OutfittingRepo;
}

export function isLinuxProfile(value: string): value is LinuxProfile {
  return (LINUX_PROFILES as ReadonlyArray<string>).includes(value);
}

export function linuxManifestPath(profile: LinuxProfile): string {
  return LINUX_PROFILE_MANIFEST_PATHS[profile];
}

function isNotFound(cause: unknown): boolean {
  return (
    cause instanceof Error && "code" in cause && (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function isGitCheckout(root: string): Promise<boolean> {
  try {
    await stat(join(root, ".git"));
    return true;
  } catch (cause) {
    if (isNotFound(cause)) {
      return false;
    }
    throw cause;
  }
}

async function canonical(path: string): Promise<string> {
  return realpath(isAbsolute(path) ? path : resolve(path));
}

async function configuredSource(
  config: ManagerConfig,
  sourceRoot?: string,
): Promise<{ root: string; mode: LinuxSource["mode"] }> {
  const configured = sourceRoot ?? envValue("OUTFITTING_REPO") ?? (await readRepoPathFile(config));
  if (configured === undefined) {
    return { root: sparseSourceRoot(config.stateRoot), mode: "sparse" };
  }

  const root = await canonical(configured);
  const managedRoot = await canonical(sparseSourceRoot(config.stateRoot)).catch((cause) => {
    if (isNotFound(cause)) {
      return undefined;
    }
    throw cause;
  });
  if (managedRoot !== undefined && root === managedRoot) {
    return { root, mode: "sparse" };
  }
  if (await isGitCheckout(root)) {
    return { root, mode: "checkout" };
  }
  throw new Error(
    `Configured Outfitting source ${root} is not a managed sparse source or Git checkout; refusing to overwrite it.`,
  );
}

async function gitResult(
  run: typeof runCommand,
  root: string,
  args: ReadonlyArray<string>,
  inherit: boolean,
) {
  return run("git", ["--no-optional-locks", "-C", root, ...args], {
    inherit,
  });
}

async function refreshCheckout(
  root: string,
  config: ManagerConfig,
  run: typeof runCommand,
): Promise<void> {
  const status = await gitResult(
    run,
    root,
    ["status", "--porcelain=v1", "--untracked-files=all"],
    false,
  );
  if (status.code !== 0) {
    throw new Error(`Unable to inspect Git checkout ${root}.`);
  }
  if (status.stdout.trim().length > 0) {
    throw new Error(`Outfitting repository at ${root} has local changes; refusing to refresh it.`);
  }

  const fetched = await gitResult(
    run,
    root,
    ["fetch", "--prune", "origin", config.manifest.ref],
    true,
  );
  if (fetched.code !== 0) {
    const detail = (fetched.stderr || fetched.stdout).trim();
    throw new Error(
      `git fetch origin ${config.manifest.ref} failed (exit ${fetched.code})${detail ? `: ${detail}` : "."}`,
    );
  }

  const head = await gitResult(run, root, ["rev-parse", "HEAD"], false);
  const target = await gitResult(run, root, ["rev-parse", "FETCH_HEAD"], false);
  if (head.code !== 0 || target.code !== 0) {
    throw new Error(`Unable to resolve the fetched Git revision for ${root}.`);
  }
  if (head.stdout.trim() === target.stdout.trim()) {
    return;
  }

  const ancestor = await gitResult(
    run,
    root,
    ["merge-base", "--is-ancestor", "HEAD", "FETCH_HEAD"],
    false,
  );
  if (ancestor.code !== 0) {
    throw new Error(
      `Fetched ${config.manifest.ref} is not a fast-forward of ${root}; update the checkout manually.`,
    );
  }

  const branch = await gitResult(run, root, ["symbolic-ref", "--quiet", "--short", "HEAD"], false);
  const update =
    branch.code === 0
      ? await gitResult(run, root, ["merge", "--ff-only", "FETCH_HEAD"], true)
      : await gitResult(run, root, ["checkout", "--detach", "FETCH_HEAD"], true);
  if (update.code !== 0) {
    const detail = (update.stderr || update.stdout).trim();
    throw new Error(`Unable to update Git checkout ${root}${detail ? `: ${detail}` : "."}`);
  }
}

async function refreshSparseSource(root: string, options: LinuxSourceOptions): Promise<void> {
  if (options.offline) {
    throw new Error("--refresh cannot be combined with --offline.");
  }
  await syncSparseSource({
    config: options.config,
    sourceRoot: root,
    paths: linuxSourcePaths(options.profile),
    fetcher: options.fetcher,
    strict: true,
  });
}

/** Select the Linux source and optionally refresh it before consumers read it. */
export async function prepareLinuxSource(options: LinuxSourceOptions): Promise<LinuxSource> {
  if (options.refresh && options.offline) {
    throw new Error("--refresh cannot be combined with --offline.");
  }
  const selected = await configuredSource(options.config, options.sourceRoot);
  if (options.refresh) {
    if (selected.mode === "checkout") {
      await refreshCheckout(selected.root, options.config, options.run ?? runCommand);
    } else {
      await refreshSparseSource(selected.root, options);
    }
  }

  let repo: OutfittingRepo | undefined;
  try {
    repo = await validateOutfittingRepo(selected.root, { profile: options.profile });
  } catch (cause) {
    if (options.refresh || selected.mode === "checkout") {
      throw cause;
    }
  }
  return { ...selected, repo };
}

/** Read a profile declaration from the selected local source or cache without fetching. */
export async function readLinuxManifest(
  config: ManagerConfig,
  profile: LinuxProfile,
  sourceRoot?: string,
): Promise<string> {
  const relative = linuxManifestPath(profile);
  if (sourceRoot !== undefined) {
    return readFile(join(sourceRoot, relative), "utf8");
  }

  const configured = envValue("OUTFITTING_REPO") ?? (await readRepoPathFile(config));
  if (configured !== undefined) {
    return readFile(join(await canonical(configured), relative), "utf8");
  }

  for (const path of [
    join(manifestsDir(config.stateRoot), relative),
    join(sparseSourceRoot(config.stateRoot), relative),
  ]) {
    try {
      return await readFile(path, "utf8");
    } catch (cause) {
      if (!isNotFound(cause)) {
        throw cause;
      }
    }
  }

  return (await fetchManifest({ path: relative, config, offline: true })).text;
}
