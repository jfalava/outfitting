import { Option, Schema } from "effect";

import type { ManifestSourceConfig } from "@/config/types";
import type { ManifestFetcher } from "@/fetch/manifest";
import { runCommand, type RunCommandResult } from "@/process";

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
  if (host === "githubusercontent.com" || host.endsWith(".githubusercontent.com") || host === "www.github.com") {
    return "github.com";
  }
  if (host === "github.com" || host.endsWith(".ghe.com") || host.startsWith("github.")) {
    return host;
  }
  return undefined;
}

/**
 * Classify a GitHub web or raw URL.
 * Public github.com uses anonymous raw content. Every other host uses `gh`.
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

/** Rewrite a public github.com URL to its raw base. Other URLs are unchanged. */
export function normalizeRepositoryUrl(value: string): string {
  const classified = classifyGitHubRepository(value);
  if (classified?.transport === "raw") {
    return classified.baseUrl;
  }
  return stripTrailingSlash(value.trim());
}

export function gitHubAuthHint(host: string): string {
  return `gh auth login --hostname ${host}`;
}

const GitHubContentEntrySchema = Schema.Struct({
  type: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  encoding: Schema.optional(Schema.String),
  content: Schema.optional(Schema.String),
  download_url: Schema.optional(Schema.Union([Schema.String, Schema.Null])),
});

type GitHubContentEntry = Schema.Schema.Type<typeof GitHubContentEntrySchema>;

const decodeContentEntry = Schema.decodeUnknownOption(GitHubContentEntrySchema);
const decodeContentList = Schema.decodeUnknownOption(Schema.Array(GitHubContentEntrySchema));

function contentEntries(body: string): ReadonlyArray<GitHubContentEntry> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (cause) {
    throw new Error("gh api returned invalid JSON.", { cause });
  }
  const list = decodeContentList(parsed);
  if (Option.isSome(list)) {
    return list.value;
  }
  const entry = decodeContentEntry(parsed);
  return Option.isSome(entry) ? [entry.value] : [];
}

async function ghApi(
  host: string,
  apiPath: string,
  run: typeof runCommand,
): Promise<string> {
  let result: RunCommandResult;
  try {
    result = await run("gh", ["api", "--hostname", host, apiPath], { inherit: false });
  } catch (cause) {
    const code = cause instanceof Error && "code" in cause ? (cause as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      throw new Error(`GitHub CLI is not installed. Authenticate with \`${gitHubAuthHint(host)}\`.`, {
        cause,
      });
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

function decodeBase64(content: string): Uint8Array {
  return Buffer.from(content.replaceAll("\n", ""), "base64");
}

function relativeBlobPath(root: string, path: string): string {
  if (root.length === 0) {
    return path;
  }
  if (path === root) {
    return path.split("/").pop() ?? path;
  }
  const prefix = `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

async function readFileEntry(
  entry: GitHubContentEntry,
  fetcher: ManifestFetcher,
): Promise<{ path: string; body: Uint8Array } | undefined> {
  if (entry.type !== "file" || entry.path === undefined) {
    return undefined;
  }
  if (entry.encoding === "base64" && entry.content !== undefined) {
    return { path: entry.path, body: decodeBase64(entry.content) };
  }
  if (entry.download_url) {
    const response = await fetcher(entry.download_url);
    if (!response.ok) {
      throw new Error(`Failed to download ${entry.path}: HTTP ${response.status}.`);
    }
    return { path: entry.path, body: new Uint8Array(await response.arrayBuffer()) };
  }
  return undefined;
}

async function collectGitHubBlobs(options: {
  repository: GitHubRepository;
  ref: string;
  path: string;
  run: typeof runCommand;
  fetcher: ManifestFetcher;
}): Promise<Array<{ path: string; body: Uint8Array }>> {
  const repoPath = options.path.replace(/^\/+|\/+$/g, "");
  const endpoint = `/repos/${options.repository.owner}/${options.repository.name}/contents/${repoPath}?ref=${encodeURIComponent(options.ref)}`;
  const entries = contentEntries(await ghApi(options.repository.host, endpoint, options.run));
  const files: Array<{ path: string; body: Uint8Array }> = [];

  for (const entry of entries) {
    if (entry.type === "dir" && entry.path !== undefined) {
      const nested = await collectGitHubBlobs({ ...options, path: entry.path });
      files.push(...nested);
      continue;
    }
    if (entry.type === "file" && entry.encoding !== "base64" && entry.download_url == null) {
      const fileEndpoint = `/repos/${options.repository.owner}/${options.repository.name}/contents/${entry.path}?ref=${encodeURIComponent(options.ref)}`;
      const [fileEntry] = contentEntries(await ghApi(options.repository.host, fileEndpoint, options.run));
      const file = fileEntry === undefined ? undefined : await readFileEntry(fileEntry, options.fetcher);
      if (file !== undefined) {
        files.push(file);
      }
      continue;
    }
    const file = await readFileEntry(entry, options.fetcher);
    if (file !== undefined) {
      files.push(file);
    }
  }

  if (files.length === 0) {
    throw new Error(
      `GitHub path \`${options.path}\` is missing from ${options.repository.host}/${options.repository.owner}/${options.repository.name}.`,
    );
  }
  return files;
}

/**
 * Read one repository-relative file or directory through `gh api`.
 * Directory reads return every nested file with paths relative to `path`.
 */
export async function readGitHubBlob(options: {
  repository: GitHubRepository;
  ref: string;
  path: string;
  run?: typeof runCommand;
  fetcher?: ManifestFetcher;
}): Promise<Array<{ path: string; body: Uint8Array }>> {
  const repoPath = options.path.replace(/^\/+|\/+$/g, "");
  const files = await collectGitHubBlobs({
    repository: options.repository,
    ref: options.ref,
    path: repoPath,
    run: options.run ?? runCommand,
    fetcher: options.fetcher ?? ((input, init) => fetch(input, init)),
  });
  return files.map((file) => ({ path: relativeBlobPath(repoPath, file.path), body: file.body }));
}

/** Resolve the authenticated GitHub repository recorded in manifest config, if any. */
export function repositoryFromManifest(manifest: ManifestSourceConfig): GitHubRepository | undefined {
  return classifyGitHubRepository(manifest.baseUrl);
}

/**
 * True when the configured source is a GitHub repository URL rather than the
 * built-in raw.githubusercontent.com monorepo base.
 */
export function isRemoteByorSource(baseUrl: string): boolean {
  const repository = classifyGitHubRepository(baseUrl);
  if (repository === undefined) {
    return false;
  }
  return !baseUrl.includes("raw.githubusercontent.com");
}

/** Remote BYOR applies only when no local checkout is selected and the URL is a GitHub repo. */
export function remoteByorPlatform(
  platform: "macos" | "linux" | "windows",
  baseUrl: string | undefined,
  localRepo: string | undefined,
): "macos" | "linux" | "windows" | undefined {
  if (localRepo !== undefined || baseUrl === undefined || !isRemoteByorSource(baseUrl)) {
    return undefined;
  }
  return platform;
}
