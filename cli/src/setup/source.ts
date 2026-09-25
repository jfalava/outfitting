import { createHash } from "node:crypto";
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
import { configuredProfile } from "@/config/profile";
import type { ManagerConfig } from "@/config/types";
import { classifyGitHubRepository, readGitHubBlobs, type ManifestFetcher } from "@/fetch/github";
import type { HostPlatform } from "@/platform";
import { runCommand } from "@/process";
import {
  linuxPathsFromProfile,
  macosPathsFromProfile,
  selectByorProfile,
  selectMacosByorProfile,
  selectWindowsByorProfiles,
  windowsPathsFromContract,
  validateLinuxByorSource,
  validateMacosByorSource,
  validateWindowsByorSource,
  type ByorContract,
  relativeSourcePath,
} from "@/source/contract";
import { isReservedSourcePath } from "@/source/reserved";

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
  format: "outfitting-source-v1";
  repository: string;
  ref: string;
  revision: string;
  declarationHash: string;
}

const SOURCE_METADATA_PATH = ".outfitting-source.json";
const ByorSourceMetadataSchema = Schema.Struct({
  format: Schema.Literal("outfitting-source-v1"),
  repository: Schema.String,
  ref: Schema.String,
  revision: Schema.String,
  declarationHash: Schema.String,
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

function requiredContract(config: ManagerConfig): ByorContract {
  if (config.declarations === undefined) {
    throw new Error(`No profile declarations are configured in ${config.configPath}.`);
  }
  return config.declarations;
}

function declarationHash(options: ByorSparseSourceOptions, contract: ByorContract): string {
  const hashInput = JSON.stringify({
    contract: selectedContract(contract, options),
    platform: options.platform,
    profile: configuredProfile(options.config, options.platform, options.profile),
  });
  return createHash("sha256").update(hashInput).digest("hex");
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
  for (const root of roots) {
    if (isReservedSourcePath(root)) {
      throw new Error(
        `Git path \`${root}\` is reserved for machine configuration and runtime state.`,
      );
    }
  }
  const selected = entries.filter(
    (entry) =>
      roots.some((root) => withinPath(entry.path, root)) && !isReservedSourcePath(entry.path),
  );
  for (const entry of selected) {
    relativeSourcePath(entry.path, "Git tree path");
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
      const { defaultProfiles: _defaultProfiles, ...shared } = contract.windows ?? {};
      const narrowedContract: ByorContract = {
        schema: 1,
        profiles: Object.fromEntries(
          selected.names.map((name) => [name, { windows: contract.profiles[name]!.windows! }]),
        ),
      };
      if (Object.keys(shared).length > 0) {
        narrowedContract.windows = shared;
      }
      return narrowedContract;
    }
  }
}

async function stageByorFiles(args: {
  staged: string;
  options: ByorSparseSourceOptions;
  contract: ByorContract;
  paths: ReadonlyArray<string>;
}): Promise<ByorSourceFile[]> {
  const { staged, options, contract, paths } = args;
  if (options.config.source?.kind !== "remote") {
    throw new Error("Remote source is not configured in config.toml.");
  }
  const { repository, ref } = options.config.source;
  const run = options.run ?? runCommand;
  const githubRepository = classifyGitHubRepository(repository);
  let files: GitSourceFile[];
  if (githubRepository !== undefined) {
    const githubFiles = await readGitHubBlobs({
      repository: githubRepository,
      ref,
      paths,
      run,
      fetcher: options.fetcher,
    });
    for (const file of githubFiles) {
      if (isReservedSourcePath(file.path)) {
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
    const source = options.config.source;
    if (source?.kind !== "remote") {
      throw new Error("Remote source is not configured in config.toml.");
    }
    files = await copyGitSourceFiles({
      repository: source.repository,
      ref: source.ref,
      paths,
      run,
      staged,
    });
  }
  const revision = files.find((file) => !isReservedSourcePath(file.path))?.revision;
  if (revision === undefined) {
    throw new Error("The selected profile declarations do not resolve to any repository files.");
  }
  const metadata: ByorSourceMetadata = {
    format: "outfitting-source-v1",
    repository,
    ref,
    revision,
    declarationHash: declarationHash(options, contract),
  };
  await writeFile(join(staged, SOURCE_METADATA_PATH), `${JSON.stringify(metadata, null, 2)}\n`);
  return files
    .filter((file) => !isReservedSourcePath(file.path))
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

async function validateByorSource(
  root: string,
  options: ByorSparseSourceOptions,
  contract: ByorContract,
): Promise<void> {
  const profile = configuredProfile(options.config, options.platform, options.profile);
  switch (options.platform) {
    case "linux":
      await validateLinuxByorSource({ root, profile, contract });
      break;
    case "macos":
      await validateMacosByorSource({ root, profile, contract });
      break;
    case "windows":
      await validateWindowsByorSource({ root, profiles: profile?.split(","), contract });
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
  if (options.config.source?.kind !== "remote") {
    throw new Error(`A remote [source] is required in ${options.config.configPath}.`);
  }
  const contract = requiredContract(options.config);
  const profile = configuredProfile(options.config, options.platform, options.profile);
  const selectedOptions = { ...options, profile };
  const currentDeclarationHash = declarationHash(selectedOptions, contract);
  if (options.offline) {
    const metadata = await readSourceMetadata(target);
    if (
      metadata.repository !== options.config.source.repository ||
      metadata.ref !== options.config.source.ref ||
      metadata.declarationHash !== currentDeclarationHash
    ) {
      throw new Error(
        `The cached source does not match the current repository, ref, and profile declarations in ${options.config.configPath}. Refresh it before using offline mode.`,
      );
    }
    await validateByorSource(target, selectedOptions, contract);
    const paths = byorClosure(contract, options.platform, profile);
    return { root: target, files: paths.map((path) => ({ path, source: "cache" })) };
  }
  const selected = selectedContract(contract, selectedOptions);
  const paths = byorClosure(selected, options.platform, profile);
  await mkdir(dirname(target), { recursive: true });
  const staged = await mkdtemp(join(dirname(target), ".outfitting-source-"));
  try {
    const files = await stageByorFiles({ staged, options: selectedOptions, contract, paths });
    await validateByorSource(staged, selectedOptions, contract);
    await replaceSourceTree(staged, target);
    return { root: target, files };
  } catch (cause) {
    await rm(staged, { recursive: true, force: true });
    throw cause;
  }
}
