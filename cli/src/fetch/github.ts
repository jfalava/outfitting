import { Schema } from "effect";

import { runCommand, type RunCommandResult } from "@/process";
import { relativeSourcePath } from "@/source/contract";
import { isReservedSourcePath } from "@/source/reserved";

export type ManifestFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type GitHubBlobTransport = "raw" | "gh";

export interface GitHubRepository {
  host: string;
  owner: string;
  name: string;
  /** Raw-content base without a ref. Meaningful for public github.com only. */
  baseUrl: string;
  transport: GitHubBlobTransport;
}

const GITHUB_WEB_HOSTS = new Set(["github.com", "www.github.com"]);

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function repositoryFromParts(host: string, owner: string, name: string): GitHubRepository {
  const normalizedHost = host.toLowerCase();
  const repoName = name.replace(/\.git$/i, "");
  const publicGitHub = GITHUB_WEB_HOSTS.has(normalizedHost);
  return {
    host: publicGitHub ? "github.com" : normalizedHost,
    owner,
    name: repoName,
    baseUrl: publicGitHub
      ? `https://raw.githubusercontent.com/${owner}/${repoName}`
      : `https://${normalizedHost}/api/v3`,
    transport: publicGitHub ? "raw" : "gh",
  };
}

function gitHubHost(hostname: string): string | undefined {
  const raw = hostname.match(/^(?:raw|codeload)\.([^/]+)$/i);
  const host = (raw?.[1] ?? hostname).toLowerCase();
  if (
    host === "githubusercontent.com" ||
    host.endsWith(".githubusercontent.com") ||
    host === "www.github.com"
  ) {
    return "github.com";
  }
  if (host === "github.com" || host.endsWith(".ghe.com") || host.startsWith("github.")) {
    return host;
  }
  return undefined;
}

/**
 * Classify a GitHub web or raw URL.
 * github.com starts with anonymous access and retries with `gh` on 404; Enterprise hosts use `gh`.
 * Returns undefined for non-GitHub URLs.
 */
export function classifyGitHubRepository(value: string): GitHubRepository | undefined {
  const normalized = stripTrailingSlash(value.trim());
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return undefined;
  }
  const host = gitHubHost(url.hostname);
  const [owner, name] = url.pathname.split("/").filter((segment) => segment.length > 0);
  if (host === undefined || owner === undefined || name === undefined) {
    return undefined;
  }
  return repositoryFromParts(host, owner, name);
}

export function gitHubAuthHint(host: string): string {
  return `gh auth login --hostname ${host}`;
}

const GitHubTreeEntrySchema = Schema.Struct({
  type: Schema.String,
  path: Schema.String,
  mode: Schema.String,
  sha: Schema.String,
});

const decodeCommit = Schema.decodeUnknownSync(Schema.Struct({ sha: Schema.String }));
const decodeTree = Schema.decodeUnknownSync(
  Schema.Struct({
    truncated: Schema.Boolean,
    tree: Schema.Array(GitHubTreeEntrySchema),
  }),
);
const decodeBlob = Schema.decodeUnknownSync(
  Schema.Struct({
    encoding: Schema.Literal("base64"),
    content: Schema.String,
  }),
);

interface GitHubReadOptions {
  repository: GitHubRepository;
  ref: string;
  paths: readonly string[];
  run?: typeof runCommand;
  fetcher?: ManifestFetcher;
}

interface GitHubFileReadOptions extends Omit<GitHubReadOptions, "paths"> {
  path: string;
}

export interface GitHubSourceFile {
  /** Always repository-relative, for both file and directory requests. */
  path: string;
  body: Uint8Array;
  mode: number;
  revision: string;
}

class GitHubHttpError extends Error {
  constructor(
    url: string,
    readonly status: number,
  ) {
    super(`Failed to fetch ${url}: HTTP ${status}.`);
    this.name = "GitHubHttpError";
  }
}

async function ghApi(host: string, apiPath: string, run: typeof runCommand): Promise<string> {
  let result: RunCommandResult;
  try {
    result = await run("gh", ["api", "--hostname", host, apiPath], { inherit: false });
  } catch (cause) {
    const code =
      cause instanceof Error && "code" in cause ? (cause as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      throw new Error(
        `GitHub CLI is not installed. Authenticate with \`${gitHubAuthHint(host)}\`.`,
        {
          cause,
        },
      );
    }
    throw cause;
  }
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(
      `Unable to read ${host} with gh (exit ${result.code}). Authenticate with \`${gitHubAuthHint(host)}\`${detail.length > 0 ? `: ${detail}` : "."}`,
      { cause: new Error(detail) },
    );
  }
  return result.stdout;
}

async function publicResponse(url: string, fetcher: ManifestFetcher = fetch): Promise<Response> {
  const response = await fetcher(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "outfitting-manager" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new GitHubHttpError(url, response.status);
  }
  return response;
}

function repositoryEndpoint(repository: GitHubRepository): string {
  return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
}

async function repositoryJson(options: GitHubReadOptions, endpoint: string): Promise<unknown> {
  if (options.repository.transport === "gh") {
    return JSON.parse(await ghApi(options.repository.host, endpoint, options.run ?? runCommand));
  }
  const response = await publicResponse(`https://api.github.com${endpoint}`, options.fetcher);
  return response.json();
}

function withinPath(path: string, root: string): boolean {
  return root === "." || path === root || path.startsWith(`${root}/`);
}

type GitHubTreeEntry = Schema.Schema.Type<typeof GitHubTreeEntrySchema>;

function selectSourceEntries(
  entries: readonly GitHubTreeEntry[],
  paths: readonly string[],
): GitHubTreeEntry[] {
  const roots = paths.map((path) => relativeSourcePath(path, "BYOR path"));
  for (const root of roots) {
    if (!entries.some((entry) => entry.type !== "tree" && withinPath(entry.path, root))) {
      throw new Error(`GitHub path \`${root}\` is missing or empty.`);
    }
    if (isReservedSourcePath(root)) {
      throw new Error(
        `GitHub path \`${root}\` is reserved for machine configuration and runtime state.`,
      );
    }
  }
  const selected = entries.filter(
    (entry) =>
      entry.type !== "tree" &&
      roots.some((root) => withinPath(entry.path, root)) &&
      !isReservedSourcePath(entry.path),
  );
  for (const entry of selected) {
    relativeSourcePath(entry.path, "GitHub tree path");
    if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) {
      throw new Error(
        `Unsupported GitHub entry ${entry.path} (${entry.mode}). Use a local checkout for symlinks or submodules.`,
      );
    }
  }
  return selected;
}

async function readSourceFile(
  options: GitHubReadOptions,
  entry: GitHubTreeEntry,
  commit: string,
): Promise<GitHubSourceFile> {
  let body: Uint8Array;
  if (options.repository.transport === "gh") {
    const blob = decodeBlob(
      await repositoryJson(
        options,
        `${repositoryEndpoint(options.repository)}/git/blobs/${encodeURIComponent(entry.sha)}`,
      ),
    );
    body = Buffer.from(blob.content, "base64");
  } else {
    const path = entry.path.split("/").map(encodeURIComponent).join("/");
    const response = await publicResponse(
      `${options.repository.baseUrl}/${encodeURIComponent(commit)}/${path}`,
      options.fetcher,
    );
    body = new Uint8Array(await response.arrayBuffer());
  }
  return {
    path: entry.path,
    body,
    mode: entry.mode === "100755" ? 0o755 : 0o644,
    revision: commit,
  };
}

async function readGitHubTree(options: GitHubReadOptions): Promise<{
  commit: string;
  entries: readonly GitHubTreeEntry[];
  repository: GitHubRepository;
}> {
  let repository = options.repository;
  const endpoint = repositoryEndpoint(repository);
  const commitPath = `${endpoint}/commits/${encodeURIComponent(options.ref)}`;
  let commitResponse: unknown;
  try {
    commitResponse = await repositoryJson(options, commitPath);
  } catch (cause) {
    if (
      repository.transport !== "raw" ||
      !(cause instanceof GitHubHttpError) ||
      cause.status !== 404
    ) {
      throw cause;
    }

    repository = { ...repository, transport: "gh" };
    try {
      commitResponse = await repositoryJson({ ...options, repository }, commitPath);
    } catch (authCause) {
      const detail = authCause instanceof Error ? authCause.message : String(authCause);
      throw new Error(
        `GitHub returned HTTP 404 for ${repository.owner}/${repository.name}@${options.ref} without authentication, and the authenticated lookup failed. Check that the repository and ref exist, and authenticate with \`${gitHubAuthHint(repository.host)}\`: ${detail}`,
        { cause: authCause },
      );
    }
  }

  const commit = decodeCommit(commitResponse);
  const tree = decodeTree(
    await repositoryJson(
      { ...options, repository },
      `${endpoint}/git/trees/${encodeURIComponent(commit.sha)}?recursive=1`,
    ),
  );
  if (tree.truncated) {
    throw new Error(
      "GitHub returned a truncated repository tree. Use a local checkout rather than publishing an incomplete source.",
    );
  }
  return { commit: commit.sha, entries: tree.tree, repository };
}

/** Read one repository file for setup metadata without adding it to the managed source snapshot. */
export async function readGitHubFile(options: GitHubFileReadOptions): Promise<GitHubSourceFile> {
  const path = relativeSourcePath(options.path, "GitHub path");
  const { commit, entries, repository } = await readGitHubTree({ ...options, paths: [path] });
  const entry = entries.find((candidate) => candidate.path === path && candidate.type === "blob");
  if (entry === undefined) {
    throw new Error(`GitHub file \`${path}\` is missing.`);
  }
  if (!["100644", "100755"].includes(entry.mode)) {
    throw new Error(
      `Unsupported GitHub entry ${entry.path} (${entry.mode}). Use a local checkout for symlinks or submodules.`,
    );
  }
  return readSourceFile({ ...options, repository, paths: [path] }, entry, commit);
}

/** Fetch the selected files/directories once, from one immutable repository revision. */
export async function readGitHubBlobs(options: GitHubReadOptions): Promise<GitHubSourceFile[]> {
  const { commit, entries, repository } = await readGitHubTree(options);
  const selected = selectSourceEntries(entries, options.paths);
  const files: GitHubSourceFile[] = [];
  for (const entry of selected) {
    files.push(await readSourceFile({ ...options, repository }, entry, commit));
  }
  return files;
}
