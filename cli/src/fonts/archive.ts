import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import { Schema } from "effect";
import { extract as createExtract, pack as createPack, type Header } from "tar-stream";

import { FONT_ARCHIVE_NAME, FONT_FILE_MODE, FONT_ROOT } from "@/fonts/constants";
import { fontExtension, readFontNames, type FontFace } from "@/fonts/names";

export interface ArchiveFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface FontArchive {
  readonly files: ReadonlyArray<ArchiveFile>;
  readonly faces: ReadonlyArray<FontFace>;
}

function concatChunks(chunks: ReadonlyArray<Uint8Array>): Uint8Array {
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const decodeBytes = Schema.decodeUnknownSync(Schema.Uint8Array);

function concatUnknownChunks(chunks: ReadonlyArray<unknown>): Uint8Array {
  return concatChunks(chunks.map((chunk) => decodeBytes(chunk)));
}

function normalizeArchivePath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function assertSafeFontPath(path: string): string {
  const normalized = normalizeArchivePath(path);
  if (
    !normalized.startsWith(FONT_ROOT) ||
    normalized.startsWith("/") ||
    normalized.includes("//")
  ) {
    throw new Error(`archive entry is outside fonts/: ${path}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`archive entry has an unsafe path: ${path}`);
  }
  if (fontExtension(normalized) === undefined) {
    throw new Error(`archive contains a non-font payload: ${path}`);
  }
  return normalized;
}

function facesForFiles(files: ReadonlyArray<ArchiveFile>): FontFace[] {
  return files
    .map((file) => {
      const names = readFontNames(file.bytes, file.path);
      return { ...names, path: file.path };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function emptyFontArchive(): FontArchive {
  return { files: [], faces: [] };
}

async function readStreamBytes(stream: AsyncIterable<unknown>): Promise<Uint8Array> {
  const chunks: unknown[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return concatUnknownChunks(chunks);
}

async function consumeEntry(
  header: Header,
  stream: AsyncIterable<unknown>,
  files: ArchiveFile[],
): Promise<void> {
  if (header.type === "directory") {
    await readStreamBytes(stream);
    return;
  }
  if (header.type === "symlink" || header.type === "link") {
    throw new Error("archive contains a symbolic or hard link");
  }
  if (header.type !== "file" && header.type !== "contiguous-file") {
    throw new Error(`archive contains unsupported entry type ${header.type}: ${header.name}`);
  }
  files.push({
    path: assertSafeFontPath(header.name),
    bytes: await readStreamBytes(stream),
  });
}

export async function unpackFontArchive(gzipped: Uint8Array): Promise<FontArchive> {
  const tar = gunzipSync(gzipped);
  const extract = createExtract();
  const files: ArchiveFile[] = [];
  extract.end(tar);
  for await (const entry of extract) {
    await consumeEntry(entry.header, entry, files);
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { files, faces: facesForFiles(files) };
}

export async function packFontArchive(files: ReadonlyArray<ArchiveFile>): Promise<Uint8Array> {
  if (files.length === 0) {
    throw new Error("archive did not contain any installable fonts");
  }

  const sorted = [...files].sort((left, right) => left.path.localeCompare(right.path));
  for (const file of sorted) {
    assertSafeFontPath(file.path);
  }

  const pack = createPack();
  const collected = readStreamBytes(pack);

  const epoch = new Date(0);
  for (const file of sorted) {
    await new Promise<void>((resolve, reject) => {
      pack.entry(
        {
          name: file.path,
          size: file.bytes.byteLength,
          mode: FONT_FILE_MODE,
          mtime: epoch,
          type: "file",
          uid: 0,
          gid: 0,
          uname: "",
          gname: "",
        },
        file.bytes,
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        },
      );
    });
  }
  pack.finalize();
  return gzipSync(await collected);
}

export function checksumSidecar(archive: Uint8Array): string {
  const digest = sha256Hex(archive);
  return `${digest}  ${FONT_ARCHIVE_NAME}\n`;
}

export function parseChecksumSidecar(value: string): string {
  const match = /^(?<hash>[0-9a-fA-F]{64}) {2}fonts\.tar\.gz\r?\n?$/.exec(value);
  const hash = match?.groups?.hash;
  if (hash === undefined) {
    throw new Error("font checksum has an invalid format");
  }
  return hash.toLowerCase();
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
