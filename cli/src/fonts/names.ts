import { FONT_EXTENSIONS, type FontExtension } from "@/fonts/constants";

const NAME_ID_FAMILY = 1;
const NAME_ID_STYLE = 2;
const NAME_ID_POSTSCRIPT = 6;
const NAME_ID_TYPOGRAPHIC_FAMILY = 16;
const NAME_ID_TYPOGRAPHIC_STYLE = 17;

const PLATFORM_UNICODE = 0;
const PLATFORM_MACINTOSH = 1;
const PLATFORM_WINDOWS = 3;

export interface FontNameRecord {
  readonly family: string;
  readonly style: string;
  readonly postscriptName: string;
}

export interface FontFace extends FontNameRecord {
  readonly path: string;
}

export function fontExtension(path: string): FontExtension | undefined {
  const lower = path.toLowerCase();
  return FONT_EXTENSIONS.find((extension) => lower.endsWith(extension));
}

export function slugifyName(value: string): string {
  const slug = value
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(/[ _]+/g, "-")
    .replaceAll(/[^a-z0-9.-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
  if (slug.length === 0) {
    throw new Error(`Unable to slugify font name "${value}".`);
  }
  return slug;
}

export function archivePathFor(family: string, style: string, extension: FontExtension): string {
  const familySlug = slugifyName(family);
  const styleSlug = slugifyName(style);
  return `fonts/${familySlug}/${familySlug}-${styleSlug}${extension}`;
}

export function keepNamePath(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/").replaceAll(/^\/+/g, "");
  const parts = normalized.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw new Error(`Refusing source path with parent segments: ${relativePath}`);
  }
  const fileName = parts.at(-1);
  if (fileName === undefined) {
    throw new Error(`Unable to keep source name for ${relativePath}.`);
  }
  const extension = fontExtension(fileName);
  if (extension === undefined) {
    throw new Error(`Unsupported font extension: ${relativePath}`);
  }
  const stem = fileName.slice(0, -extension.length);
  const slugged = parts.slice(0, -1).map(slugifyName);
  slugged.push(`${slugifyName(stem)}${extension.toLowerCase()}`);
  return `fonts/${slugged.join("/")}`;
}

function readUint16(view: DataView, offset: number): number {
  if (offset + 2 > view.byteLength) {
    throw new Error("Truncated OpenType table.");
  }
  return view.getUint16(offset, false);
}

function readUint32(view: DataView, offset: number): number {
  if (offset + 4 > view.byteLength) {
    throw new Error("Truncated OpenType table.");
  }
  return view.getUint32(offset, false);
}

function tagAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function decodeNameBytes(platformId: number, encodingId: number, bytes: Uint8Array): string {
  if (platformId === PLATFORM_UNICODE || platformId === PLATFORM_WINDOWS) {
    return new TextDecoder("utf-16be").decode(bytes).replaceAll("\u0000", "").trim();
  }
  if (platformId === PLATFORM_MACINTOSH && encodingId === 0) {
    return new TextDecoder("mac").decode(bytes).trim();
  }
  return new TextDecoder("latin1").decode(bytes).trim();
}

interface NamedString {
  readonly nameId: number;
  readonly platformId: number;
  readonly encodingId: number;
  readonly languageId: number;
  readonly value: string;
}

function nameScore(record: NamedString): number {
  const english =
    (record.platformId === PLATFORM_WINDOWS && record.languageId === 0x0409) ||
    (record.platformId === PLATFORM_MACINTOSH && record.languageId === 0) ||
    (record.platformId === PLATFORM_UNICODE && record.languageId === 0);
  const platformRank =
    record.platformId === PLATFORM_WINDOWS ? 3 : record.platformId === PLATFORM_UNICODE ? 2 : 1;
  return (english ? 10 : 0) + platformRank;
}

function pickName(records: ReadonlyArray<NamedString>, nameId: number): string | undefined {
  const matches = records.filter((record) => record.nameId === nameId && record.value.length > 0);
  if (matches.length === 0) {
    return undefined;
  }
  return matches.toSorted((left, right) => nameScore(right) - nameScore(left))[0]?.value;
}

function parseNameTable(bytes: Uint8Array): FontNameRecord {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = readUint16(view, 2);
  const stringOffset = readUint16(view, 4);
  const records: NamedString[] = [];

  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 12;
    const platformId = readUint16(view, entry);
    const encodingId = readUint16(view, entry + 2);
    const languageId = readUint16(view, entry + 4);
    const nameId = readUint16(view, entry + 6);
    const length = readUint16(view, entry + 8);
    const offset = stringOffset + readUint16(view, entry + 10);
    if (offset + length > bytes.byteLength) {
      throw new Error("OpenType name table string is truncated.");
    }
    const value = decodeNameBytes(platformId, encodingId, bytes.subarray(offset, offset + length));
    records.push({ nameId, platformId, encodingId, languageId, value });
  }

  const family = pickName(records, NAME_ID_TYPOGRAPHIC_FAMILY) ?? pickName(records, NAME_ID_FAMILY);
  const style = pickName(records, NAME_ID_TYPOGRAPHIC_STYLE) ?? pickName(records, NAME_ID_STYLE);
  const postscriptName = pickName(records, NAME_ID_POSTSCRIPT);
  if (family === undefined || style === undefined || postscriptName === undefined) {
    throw new Error("OpenType name table is missing family, style, or PostScript name.");
  }
  return { family, style, postscriptName };
}

function tableDirectory(
  bytes: Uint8Array,
  offset: number,
): Map<string, { offset: number; length: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = readUint16(view, offset + 4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let index = 0; index < numTables; index += 1) {
    const entry = offset + 12 + index * 16;
    tables.set(tagAt(bytes, entry), {
      offset: readUint32(view, entry + 8),
      length: readUint32(view, entry + 12),
    });
  }
  return tables;
}

function nameTableBytes(bytes: Uint8Array, sfntOffset: number): Uint8Array {
  const tables = tableDirectory(bytes, sfntOffset);
  const name = tables.get("name");
  if (name === undefined) {
    throw new Error("Font is missing an OpenType name table.");
  }
  if (name.offset + name.length > bytes.byteLength) {
    throw new Error("OpenType name table is truncated.");
  }
  return bytes.subarray(name.offset, name.offset + name.length);
}

function parseCollection(bytes: Uint8Array): FontNameRecord {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numFonts = readUint32(view, 8);
  if (numFonts < 1) {
    throw new Error("TrueType Collection contains no fonts.");
  }
  const sfntOffset = readUint32(view, 12);
  return parseNameTable(nameTableBytes(bytes, sfntOffset));
}

export function readFontNames(bytes: Uint8Array, sourcePath: string): FontNameRecord {
  if (bytes.byteLength < 12) {
    throw new Error(`Unable to read OpenType names from ${sourcePath}.`);
  }
  const tag = tagAt(bytes, 0);
  try {
    if (tag === "ttcf") {
      return parseCollection(bytes);
    }
    if (tag === "OTTO" || tag === "true" || tag === "\0\u0001\0\0") {
      return parseNameTable(nameTableBytes(bytes, 0));
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Unable to read OpenType names from ${sourcePath}: ${detail}`, { cause: cause });
  }
  throw new Error(`Unsupported font sfnt tag in ${sourcePath}.`);
}
