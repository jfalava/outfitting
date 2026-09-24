import {
  chmod,
  copyFile,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import { Schema } from "effect";

import { sparseSourceRoot } from "@/config/paths";
import type { ManagerConfig } from "@/config/types";
import { classifyGitHubRepository, readGitHubBlobs, type ManifestFetcher } from "@/fetch/github";
import type { HostPlatform } from "@/platform";
import { runCommand } from "@/process";
import {
  byorMapMissingError,
  localMapAsSourceFile,
  readByorMap,
  type ByorMap,
} from "@/source/byor-map";
import {
  BYOR_CONTRACT_PATH,
  linuxPathsFromProfile,
  macosPathsFromProfile,
  selectByorProfile,
  selectMacosByorProfile,
  selectWindowsByorProfiles,
  readByorContract,
  windowsPathsFromContract,
  validateLinuxByorSource,
  validateMacosByorSource,
  validateWindowsByorSource,
  type ByorContract,
  relativeSourcePath,
} from "@/source/contract";

export interface ByorSourceFile {
  path: string;
  source: "network" | "cache";
  warning?: string;
}

export interface ByorSourceResult {
  root: string;
  files: ByorSourceFile[];
}

function isNotFound(cause: unknown): boolean {
  return (
    cause instanceof Error && "code" in cause && (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function replaceSourceTree(staged: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const backup = await mkdtemp(join(dirname(target), ".outfitting-source-backup-"));
  await rm(backup, { recursive: true, force: true });

  let movedExisting = false;
  try {
    await rename(target, backup);
    movedExisting = true;
  } catch (cause) {
    if (!isNotFound(cause)) {
      throw cause;
    }
  }

  try {
    await rename(staged, target);
  } catch (cause) {
    if (movedExisting) {
      try {
        await rename(backup, target);
      } catch (restoreCause) {
        throw new Error(
          `Could not publish the refreshed source and could not restore the previous source. Previous source remains at ${backup}. Publish error: ${cause instanceof Error ? cause.message : String(cause)}. Restore error: ${restoreCause instanceof Error ? restoreCause.message : String(restoreCause)}.`,
          { cause: restoreCause },
        );
      }
    }
    throw cause;
  }

  if (movedExisting) {
    // Publication has committed. Cleanup failure must not report a failed refresh
    // while leaving the new source active; keep the backup for manual recovery.
    await rm(backup, { recursive: true, force: true }).catch(() => undefined);
  }
}

export interface ByorSparseSourceOptions {
  config: ManagerConfig;
  platform: HostPlatform;
  /** Selected profile. Windows accepts comma-separated names. */
  profile?: string;
  sourceRoot?: string;
  fetcher?: ManifestFetcher;
  run?: typeof runCommand;
  offline?: boolean;
}

interface GitTreeEntry {
  mode: string;
  type: string;
  path: string;
}

interface GitSourceFile {
  path: string;
  mode: number;
  revision: string;
}

interface ByorSourceMetadata {
  repository: string;
  ref: string;
  revision: string;
}

const SOURCE_METADATA_PATH = ".outfitting-source.json";
const ByorSourceMetadataSchema = Schema.Struct({
  repository: Schema.String,
  ref: Schema.String,
  revision: Schema.String,
});
const decodeByorSourceMetadata = Schema.decodeUnknownSync(ByorSourceMetadataSchema);

function byorClosure(
  contract: ByorContract,
  platform: HostPlatform,
  profile: string | undefined,
): string[] {
  switch (platform) {
    case "macos":
      return macosPathsFromProfile(selectMacosByorProfile(contract, profile).macos);
    case "linux":
      return linuxPathsFromProfile(selectByorProfile(contract, profile).linux);
    case "windows":
      return windowsPathsFromContract(
        contract,
        profile === undefined ? undefined : profile.split(","),
      );
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}

async function readLocalByorMap(stateRoot: string): Promise<ByorMap> {
  const map = await readByorMap(stateRoot);
  if (map === undefined) {
    throw new Error(byorMapMissingError());
  }
  return map;
}

function byorMapContract(map: ByorMap): ByorContract {
  return map.windows === undefined
    ? { schema: map.schema, profiles: map.profiles }
    : { schema: map.schema, windows: map.windows, profiles: map.profiles };
}

function withinPath(path: string, root: string): boolean {
  return root === "." || path === root || path.startsWith(`${root}/`);
}

async function runGit(
  run: typeof runCommand,
  cwd: string,
  args: ReadonlyArray<string>,
): Promise<string> {
  const result = await run("git", args, { cwd, inherit: false });
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(
      `git ${args.join(" ")} failed (exit ${result.code})${detail.length > 0 ? `: ${detail}` : "."}`,
    );
  }
  return result.stdout;
}

function parseGitTree(output: string): GitTreeEntry[] {
  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const tab = record.indexOf("\t");
      if (tab < 0) {
        throw new Error("Git returned a malformed tree entry.");
      }
      const [mode, type, object] = record.slice(0, tab).split(" ");
      if (mode === undefined || type === undefined || object === undefined) {
        throw new Error("Git returned a malformed tree entry.");
      }
      return { mode, type, path: record.slice(tab + 1) };
    });
}

function selectGitTreeEntries(
  entries: readonly GitTreeEntry[],
  paths: ReadonlyArray<string>,
): GitTreeEntry[] {
  const roots = paths.map((path) => relativeSourcePath(path, "BYOR path"));
  for (const root of roots) {
    if (!entries.some((entry) => withinPath(entry.path, root))) {
      throw new Error(`Git path \`${root}\` is missing or empty.`);
    }
  }
  const selected = entries.filter((entry) => roots.some((root) => withinPath(entry.path, root)));
  for (const entry of selected) {
    relativeSourcePath(entry.path, "Git tree path");
    if (entry.path === SOURCE_METADATA_PATH) {
      throw new Error(`Git path \`${SOURCE_METADATA_PATH}\` is reserved for source metadata.`);
    }
    if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) {
      throw new Error(
        `Unsupported Git entry ${entry.path} (${entry.mode}). Remote BYOR sources cannot contain symlinks or submodules in selected paths.`,
      );
    }
  }
  return selected;
}

async function copyGitSourceFiles(options: {
  repository: string;
  ref: string;
  paths: ReadonlyArray<string>;
  run: typeof runCommand;
  staged: string;
}): Promise<GitSourceFile[]> {
  const checkout = await mkdtemp(join(dirname(options.staged), ".outfitting-git-"));
  try {
    await runGit(options.run, checkout, ["init", "--quiet"]);
    await runGit(options.run, checkout, ["remote", "add", "origin", options.repository]);
    await runGit(options.run, checkout, ["fetch", "--depth=1", "--no-tags", "origin", options.ref]);
    const revision = (
      await runGit(options.run, checkout, ["rev-parse", "--verify", "FETCH_HEAD^{commit}"])
    ).trim();
    if (!/^[0-9a-f]{40,64}$/i.test(revision)) {
      throw new Error("Git returned an invalid fetched revision.");
    }
    const tree = parseGitTree(
      await runGit(options.run, checkout, ["ls-tree", "--full-tree", "-rz", "-r", revision]),
    );
    const selected = selectGitTreeEntries(tree, options.paths);
    const roots = [...new Set(options.paths.map((path) => relativeSourcePath(path, "BYOR path")))];
    await runGit(options.run, checkout, ["checkout", revision, "--", ...roots]);

    for (const entry of selected) {
      const sourcePath = join(checkout, entry.path);
      const info = await lstat(sourcePath);
      if (!info.isFile() || info.isSymbolicLink()) {
        throw new Error(`Git checkout produced an unsupported file at ${entry.path}.`);
      }
      const destination = join(options.staged, entry.path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(sourcePath, destination);
      await chmod(destination, entry.mode === "100755" ? 0o755 : 0o644);
    }
    return selected.map((entry) => ({
      path: entry.path,
      mode: entry.mode === "100755" ? 0o755 : 0o644,
      revision,
    }));
  } finally {
    await rm(checkout, { force: true, recursive: true });
  }
}

function selectedContract(contract: ByorContract, options: ByorSparseSourceOptions): ByorContract {
  switch (options.platform) {
    case "linux": {
      const selected = selectByorProfile(contract, options.profile);
      return { schema: 1, profiles: { [selected.name]: { linux: selected.linux } } };
    }
    case "macos": {
      const selected = selectMacosByorProfile(contract, options.profile);
      return { schema: 1, profiles: { [selected.name]: { macos: selected.macos } } };
    }
    case "windows": {
      const selected = selectWindowsByorProfiles(contract, options.profile?.split(","));
      const result: ByorContract = {
        schema: 1,
        profiles: Object.fromEntries(
          selected.names.map((name) => [name, { windows: contract.profiles[name]!.windows! }]),
        ),
      };
      if (contract.windows !== undefined) {
        result.windows = { ...contract.windows, defaultProfiles: selected.names };
      }
      return result;
    }
  }
}

async function stageByorFiles(args: {
  staged: string;
  options: ByorSparseSourceOptions;
  map: ByorMap;
  contract: ByorContract;
  paths: ReadonlyArray<string>;
}): Promise<ByorSourceFile[]> {
  const { staged, options, map, contract, paths } = args;
  const run = options.run ?? runCommand;
  const repository = classifyGitHubRepository(map.repository);
  let files: GitSourceFile[];
  if (repository !== undefined) {
    const githubFiles = await readGitHubBlobs({
      repository,
      ref: map.ref,
      paths,
      run,
      fetcher: options.fetcher,
    });
    for (const file of githubFiles) {
      if (file.path === BYOR_CONTRACT_PATH) {
        continue;
      }
      const destination = join(staged, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, file.body, { mode: file.mode });
    }
    files = githubFiles.map((file) => ({
      path: file.path,
      mode: file.mode,
      revision: file.revision,
    }));
  } else {
    files = await copyGitSourceFiles({
      repository: map.repository,
      ref: map.ref,
      paths,
      run,
      staged,
    });
  }
  const revision = files[0]?.revision;
  if (revision === undefined) {
    throw new Error("The selected BYOR contract does not resolve to any repository files.");
  }
  // The local map owns profile selection, even when fetching a root flake.
  const mapFile = localMapAsSourceFile(contract);
  await writeFile(join(staged, mapFile.path), mapFile.body);
  const metadata: ByorSourceMetadata = { repository: map.repository, ref: map.ref, revision };
  await writeFile(join(staged, SOURCE_METADATA_PATH), `${JSON.stringify(metadata, null, 2)}\n`);
  return files
    .filter((file) => file.path !== BYOR_CONTRACT_PATH)
    .map((file) => ({ path: file.path, source: "network" }));
}

async function readSourceMetadata(root: string): Promise<ByorSourceMetadata> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(join(root, SOURCE_METADATA_PATH), "utf8"));
  } catch (cause) {
    throw new Error(`No validated remote BYOR source metadata exists at ${root}.`, { cause });
  }
  try {
    return decodeByorSourceMetadata(value);
  } catch (cause) {
    throw new Error(`Remote BYOR source metadata is invalid at ${root}.`, { cause });
  }
}

async function validateByorSource(root: string, options: ByorSparseSourceOptions): Promise<void> {
  switch (options.platform) {
    case "linux":
      await validateLinuxByorSource({ root, profile: options.profile });
      break;
    case "macos":
      await validateMacosByorSource({ root, profile: options.profile });
      break;
    case "windows":
      await validateWindowsByorSource({ root, profiles: options.profile?.split(",") });
      break;
  }
}

/**
 * Fetch and validate the local map's selected remote closure before replacing the managed tree.
 * Offline mode validates and reuses the existing snapshot only for the selected Git repository/ref.
 */
export async function syncByorSparseSource(
  options: ByorSparseSourceOptions,
): Promise<ByorSourceResult> {
  const target = options.sourceRoot ?? sparseSourceRoot(options.config.stateRoot);
  const map = await readLocalByorMap(options.config.stateRoot);
  if (options.offline) {
    const metadata = await readSourceMetadata(target);
    if (metadata.repository !== map.repository || metadata.ref !== map.ref) {
      throw new Error(
        `The cached BYOR source belongs to ${metadata.repository}@${metadata.ref}, not ${map.repository}@${map.ref}.`,
      );
    }
    await validateByorSource(target, options);
    const paths = byorClosure(await readByorContract(target), options.platform, options.profile);
    return { root: target, files: paths.map((path) => ({ path, source: "cache" })) };
  }
  const contract = selectedContract(byorMapContract(map), options);
  const paths = byorClosure(contract, options.platform, options.profile);
  await mkdir(dirname(target), { recursive: true });
  const staged = await mkdtemp(join(dirname(target), ".outfitting-source-"));
  try {
    const files = await stageByorFiles({ staged, options, map, contract, paths });
    await validateByorSource(staged, options);
    await replaceSourceTree(staged, target);
    return { root: target, files };
  } catch (cause) {
    await rm(staged, { recursive: true, force: true });
    throw cause;
  }
}
