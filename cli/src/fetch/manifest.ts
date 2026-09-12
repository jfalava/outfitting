import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { loadConfig, manifestCacheDir, manifestsDir, type ManagerConfig } from "@/config";
import { readCachedManifest, writeCachedManifest, type CachedManifest } from "@/fetch/cache";

export type ManifestFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface FetchManifestOptions {
  /** Repo-relative path, e.g. `packages/macos/Brewfile`. */
  path: string;
  config?: ManagerConfig;
  /** Override cache root (tests). */
  cacheRoot?: string;
  /** Also write a convenience copy under stateRoot/manifests/<path>. */
  materialize?: boolean;
  fetcher?: ManifestFetcher;
  /** When true, never hit the network — cache only. */
  offline?: boolean;
}

export interface FetchedManifest {
  path: string;
  url: string;
  body: Uint8Array;
  text: string;
  /** `network` fresh/304-validated; `cache` served offline or after failure. */
  source: "network" | "cache";
  etag?: string;
  /** Set when falling back to last-good cache. */
  warning?: string;
  /** Absolute path if materialize copied the body. */
  materializedPath?: string;
}

function encodePathSegments(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** Build `${baseUrl}/${ref}/${path}` for GitHub raw (or compatible) hosts. */
export function manifestUrl(config: Pick<ManagerConfig, "manifest">, path: string): string {
  const normalized = path.replace(/^\/+/, "");
  return `${config.manifest.baseUrl}/${encodeURIComponent(config.manifest.ref)}/${encodePathSegments(normalized)}`;
}

async function materializeBody(
  root: string,
  relativePath: string,
  body: Uint8Array,
): Promise<string> {
  const target = join(manifestsDir(root), relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body);
  return target;
}

interface FromCacheParams {
  relativePath: string;
  url: string;
  cached: CachedManifest;
  source: FetchedManifest["source"];
  stateRoot: string;
  materialize?: boolean;
  warning?: string;
}

async function fromCache(params: FromCacheParams): Promise<FetchedManifest> {
  const materializedPath = params.materialize
    ? await materializeBody(params.stateRoot, params.relativePath, params.cached.body)
    : undefined;
  const result: FetchedManifest = {
    path: params.relativePath,
    url: params.url,
    body: params.cached.body,
    text: new TextDecoder().decode(params.cached.body),
    source: params.source,
  };
  if (params.cached.meta.etag !== undefined) {
    result.etag = params.cached.meta.etag;
  }
  if (params.warning !== undefined) {
    result.warning = params.warning;
  }
  if (materializedPath !== undefined) {
    result.materializedPath = materializedPath;
  }
  return result;
}

function requestHeaders(etag: string | undefined): Headers {
  const headers = new Headers({
    Accept: "application/octet-stream, text/plain, */*",
    "User-Agent": "outfitting-manager",
  });
  if (etag !== undefined) {
    headers.set("If-None-Match", etag);
  }
  return headers;
}

async function fetchWithOptionalTimeout(
  fetcher: ManifestFetcher,
  url: string,
  headers: Headers,
  useTimeout: boolean,
): Promise<Response> {
  if (useTimeout) {
    return fetcher(url, { headers, signal: AbortSignal.timeout(30_000) });
  }
  return fetcher(url, { headers });
}

interface StoreParams {
  relativePath: string;
  url: string;
  body: Uint8Array;
  etag: string | undefined;
  contentType: string | undefined;
  cacheRoot: string;
  stateRoot: string;
  materialize: boolean | undefined;
}

async function storeAndReturn(params: StoreParams): Promise<FetchedManifest> {
  await writeCachedManifest(params.cacheRoot, params.url, params.body, {
    etag: params.etag,
    contentType: params.contentType,
    fetchedAt: new Date().toISOString(),
  });
  const materializedPath = params.materialize
    ? await materializeBody(params.stateRoot, params.relativePath, params.body)
    : undefined;
  const result: FetchedManifest = {
    path: params.relativePath,
    url: params.url,
    body: params.body,
    text: new TextDecoder().decode(params.body),
    source: "network",
  };
  if (params.etag !== undefined) {
    result.etag = params.etag;
  }
  if (materializedPath !== undefined) {
    result.materializedPath = materializedPath;
  }
  return result;
}

interface HttpResponseParams {
  response: Response;
  cached: CachedManifest | undefined;
  relativePath: string;
  url: string;
  cacheRoot: string;
  stateRoot: string;
  materialize: boolean | undefined;
}

async function handleHttpResponse(params: HttpResponseParams): Promise<FetchedManifest> {
  const { response, cached, relativePath, url, cacheRoot, stateRoot, materialize } = params;

  if (response.status === 304) {
    if (!cached) {
      throw new Error(`Received HTTP 304 for ${relativePath} but no cache entry exists.`);
    }
    return fromCache({
      relativePath,
      url,
      cached,
      source: "network",
      stateRoot,
      materialize,
    });
  }

  if (!response.ok) {
    if (cached) {
      return fromCache({
        relativePath,
        url,
        cached,
        source: "cache",
        stateRoot,
        materialize,
        warning: `HTTP ${response.status} fetching ${relativePath}; using cached manifest.`,
      });
    }
    throw new Error(`Failed to fetch manifest ${relativePath}: HTTP ${response.status}.`);
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  return storeAndReturn({
    relativePath,
    url,
    body: buffer,
    etag: response.headers.get("etag") ?? undefined,
    contentType: response.headers.get("content-type") ?? undefined,
    cacheRoot,
    stateRoot,
    materialize,
  });
}

/**
 * Fetch a named monorepo artifact via GitHub raw (configurable base+ref).
 * Uses disk cache + ETag; offline / network failure → last cache + warning.
 */
export async function fetchManifest(options: FetchManifestOptions): Promise<FetchedManifest> {
  const config = options.config ?? (await loadConfig());
  const relativePath = options.path.replace(/^\/+/, "");
  const url = manifestUrl(config, relativePath);
  const cacheRoot = options.cacheRoot ?? manifestCacheDir(config.stateRoot);
  const useDefaultFetcher = options.fetcher === undefined;
  const fetcher = options.fetcher ?? fetch;
  const cached = await readCachedManifest(cacheRoot, url);

  if (options.offline) {
    if (!cached) {
      throw new Error(`No cached manifest for ${relativePath} (offline mode).`);
    }
    return fromCache({
      relativePath,
      url,
      cached,
      source: "cache",
      stateRoot: config.stateRoot,
      materialize: options.materialize,
      warning: `Using cached manifest for ${relativePath} (offline mode).`,
    });
  }

  let response: Response;
  try {
    response = await fetchWithOptionalTimeout(
      fetcher,
      url,
      requestHeaders(cached?.meta.etag),
      useDefaultFetcher,
    );
  } catch (cause) {
    if (cached) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      return fromCache({
        relativePath,
        url,
        cached,
        source: "cache",
        stateRoot: config.stateRoot,
        materialize: options.materialize,
        warning: `Network failed (${reason}); using cached manifest for ${relativePath}.`,
      });
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Failed to fetch manifest ${relativePath}: ${message}`, { cause });
  }

  return handleHttpResponse({
    response,
    cached,
    relativePath,
    url,
    cacheRoot,
    stateRoot: config.stateRoot,
    materialize: options.materialize,
  });
}
