import { inflateRawSync } from "node:zlib";

interface ZipDirectory {
  entryCount: number;
  offset: number;
  end: number;
}

interface ZipEntry {
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localFileOffset: number;
  name: string;
  nextOffset: number;
}

const END_OF_DIRECTORY = 0x06054b50;
const CENTRAL_ENTRY = 0x02014b50;
const LOCAL_ENTRY = 0x04034b50;
const END_RECORD_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function ensureRange(offset: number, size: number, length: number, message: string): void {
  if (offset < 0 || size < 0 || offset + size > length) {
    throw new Error(message);
  }
}

function findDirectory(archive: Uint8Array, view: DataView): ZipDirectory {
  if (archive.length < END_RECORD_SIZE) {
    throw new Error("Downloaded release is not a valid ZIP archive.");
  }

  const searchStart = Math.max(0, archive.length - END_RECORD_SIZE - MAX_COMMENT_SIZE);
  const lastRecordOffset = archive.length - END_RECORD_SIZE;
  let recordOffset = -1;
  for (let offset = lastRecordOffset; offset >= searchStart; offset -= 1) {
    if (readUint32(view, offset) === END_OF_DIRECTORY) {
      recordOffset = offset;
      break;
    }
  }
  if (recordOffset < 0) {
    throw new Error("Downloaded release is not a valid ZIP archive.");
  }

  const entryCount = readUint16(view, recordOffset + 10);
  const directorySize = readUint32(view, recordOffset + 12);
  const directoryOffset = readUint32(view, recordOffset + 16);
  const directoryEnd = directoryOffset + directorySize;
  ensureRange(
    directoryOffset,
    directorySize,
    archive.length,
    "Downloaded release has an invalid ZIP directory.",
  );
  return { entryCount, offset: directoryOffset, end: directoryEnd };
}

function readEntry(archive: Uint8Array, view: DataView, offset: number): ZipEntry {
  ensureRange(offset, 46, archive.length, "Downloaded release has an invalid ZIP entry.");
  if (readUint32(view, offset) !== CENTRAL_ENTRY) {
    throw new Error("Downloaded release has an invalid ZIP entry.");
  }

  const fileNameLength = readUint16(view, offset + 28);
  const extraFieldLength = readUint16(view, offset + 30);
  const commentLength = readUint16(view, offset + 32);
  const fileNameOffset = offset + 46;
  const nextOffset = fileNameOffset + fileNameLength + extraFieldLength + commentLength;
  ensureRange(
    fileNameOffset,
    fileNameLength + extraFieldLength + commentLength,
    archive.length,
    "Downloaded release has a truncated ZIP entry.",
  );
  return {
    compressionMethod: readUint16(view, offset + 10),
    compressedSize: readUint32(view, offset + 20),
    uncompressedSize: readUint32(view, offset + 24),
    localFileOffset: readUint32(view, offset + 42),
    name: new TextDecoder().decode(
      archive.subarray(fileNameOffset, fileNameOffset + fileNameLength),
    ),
    nextOffset,
  };
}

function extractEntry(archive: Uint8Array, view: DataView, entry: ZipEntry): Uint8Array {
  ensureRange(
    entry.localFileOffset,
    30,
    archive.length,
    "Downloaded release has an invalid executable entry.",
  );
  if (readUint32(view, entry.localFileOffset) !== LOCAL_ENTRY) {
    throw new Error("Downloaded release has an invalid executable entry.");
  }

  const fileNameLength = readUint16(view, entry.localFileOffset + 26);
  const extraFieldLength = readUint16(view, entry.localFileOffset + 28);
  const dataOffset = entry.localFileOffset + 30 + fileNameLength + extraFieldLength;
  ensureRange(
    dataOffset,
    entry.compressedSize,
    archive.length,
    "Downloaded release has a truncated executable entry.",
  );
  const compressed = archive.subarray(dataOffset, dataOffset + entry.compressedSize);
  const binary =
    entry.compressionMethod === 0
      ? compressed
      : entry.compressionMethod === 8
        ? new Uint8Array(inflateRawSync(compressed))
        : undefined;
  if (!binary) {
    throw new Error(
      `Downloaded release uses unsupported ZIP compression method ${entry.compressionMethod}.`,
    );
  }
  if (binary.byteLength !== entry.uncompressedSize) {
    throw new Error("Downloaded release executable size does not match its ZIP entry.");
  }
  return binary;
}

export function extractZipBinary(archive: Uint8Array, expectedName: string): Uint8Array {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const directory = findDirectory(archive, view);
  let offset = directory.offset;

  for (let index = 0; index < directory.entryCount && offset < directory.end; index += 1) {
    const entry = readEntry(archive, view, offset);
    if (entry.name === expectedName) {
      return extractEntry(archive, view, entry);
    }
    offset = entry.nextOffset;
  }

  throw new Error(`Downloaded release does not contain ${expectedName}.`);
}
