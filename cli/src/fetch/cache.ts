import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Option, Schema } from "effect";

export interface CachedManifestMeta {
  url: string;
  etag?: string;
  fetchedAt: string;
  contentType?: string;
}

export interface CachedManifest {
  body: Uint8Array;
  meta: CachedManifestMeta;
}

const MetaSchema = Schema.Struct({
  url: Schema.String,
  etag: Schema.optional(Schema.String),
  fetchedAt: Schema.String,
  contentType: Schema.optional(Schema.String),
});

const decodeMeta = Schema.decodeUnknownOption(MetaSchema);

function entryDir(cacheRoot: string, url: string): string {
  const hash = createHash("sha256").update(url).digest("hex");
  return join(cacheRoot, hash);
}

function isNotFound(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    "code" in cause &&
    (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function readCachedManifest(
  cacheRoot: string,
  url: string,
): Promise<CachedManifest | undefined> {
  const dir = entryDir(cacheRoot, url);
  try {
    const [body, metaRaw] = await Promise.all([
      readFile(join(dir, "body")),
      readFile(join(dir, "meta.json"), "utf8"),
    ]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(metaRaw) as unknown;
    } catch {
      return undefined;
    }
    const decoded = decodeMeta(parsed);
    if (Option.isNone(decoded) || decoded.value.url !== url) {
      return undefined;
    }
    const meta: CachedManifestMeta = {
      url: decoded.value.url,
      fetchedAt: decoded.value.fetchedAt,
    };
    if (decoded.value.etag !== undefined) {
      meta.etag = decoded.value.etag;
    }
    if (decoded.value.contentType !== undefined) {
      meta.contentType = decoded.value.contentType;
    }
    return { body: new Uint8Array(body), meta };
  } catch (cause) {
    if (isNotFound(cause)) {
      return undefined;
    }
    throw cause;
  }
}

export async function writeCachedManifest(
  cacheRoot: string,
  url: string,
  body: Uint8Array,
  meta: Omit<CachedManifestMeta, "url"> & { url?: string },
): Promise<void> {
  const dir = entryDir(cacheRoot, url);
  await mkdir(dir, { recursive: true });
  const fullMeta: CachedManifestMeta = {
    url,
    fetchedAt: meta.fetchedAt,
  };
  if (meta.etag !== undefined) {
    fullMeta.etag = meta.etag;
  }
  if (meta.contentType !== undefined) {
    fullMeta.contentType = meta.contentType;
  }
  await writeFile(join(dir, "body"), body);
  await writeFile(join(dir, "meta.json"), `${JSON.stringify(fullMeta, null, 2)}\n`, "utf8");
}
