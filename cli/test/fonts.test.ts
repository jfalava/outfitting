import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  checksumSidecar,
  emptyFontArchive,
  packFontArchive,
  parseChecksumSidecar,
  unpackFontArchive,
} from "@/fonts/archive";
import { archivePathFor, keepNamePath, readFontNames, slugifyName } from "@/fonts/names";
import { collectIncomingFonts, planPublish, planRemove } from "@/fonts/plan";
import { normalizeR2Endpoint } from "@/fonts/keychain";

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, false);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, false);
}

function encodeUtf16Be(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1) {
    view.setUint16(index * 2, value.charCodeAt(index), false);
  }
  return bytes;
}

function makeOpenType(family: string, style: string, postscriptName: string): Uint8Array {
  const names = [
    { id: 1, value: family },
    { id: 2, value: style },
    { id: 6, value: postscriptName },
    { id: 16, value: family },
    { id: 17, value: style },
  ];
  const encoded = names.map((name) => encodeUtf16Be(name.value));
  const stringBytes = encoded.reduce((total, bytes) => total + bytes.byteLength, 0);
  const nameTable = new Uint8Array(6 + names.length * 12 + stringBytes);
  const nameView = new DataView(nameTable.buffer);
  writeUint16(nameView, 0, 0);
  writeUint16(nameView, 2, names.length);
  writeUint16(nameView, 4, 6 + names.length * 12);
  let stringOffset = 0;
  for (const [index, name] of names.entries()) {
    const bytes = encoded[index];
    if (bytes === undefined) {
      throw new Error("Missing encoded name.");
    }
    const entry = 6 + index * 12;
    writeUint16(nameView, entry, 3);
    writeUint16(nameView, entry + 2, 1);
    writeUint16(nameView, entry + 4, 0x0409);
    writeUint16(nameView, entry + 6, name.id);
    writeUint16(nameView, entry + 8, bytes.byteLength);
    writeUint16(nameView, entry + 10, stringOffset);
    nameTable.set(bytes, 6 + names.length * 12 + stringOffset);
    stringOffset += bytes.byteLength;
  }

  const headerSize = 12 + 16;
  const font = new Uint8Array(headerSize + nameTable.byteLength);
  const view = new DataView(font.buffer);
  font.set(new TextEncoder().encode("OTTO"), 0);
  writeUint16(view, 4, 1);
  writeUint16(view, 6, 16);
  writeUint16(view, 8, 0);
  writeUint16(view, 10, 0);
  font.set(new TextEncoder().encode("name"), 12);
  writeUint32(view, 16, 0);
  writeUint32(view, 20, headerSize);
  writeUint32(view, 24, nameTable.byteLength);
  font.set(nameTable, headerSize);
  return font;
}

describe("fonts helpers", () => {
  test("slugifies OpenType names into archive paths", () => {
    expect(slugifyName("IBM Plex Sans")).toBe("ibm-plex-sans");
    expect(archivePathFor("IBM Plex Sans", "SemiBold Italic", ".otf")).toBe(
      "fonts/ibm-plex-sans/ibm-plex-sans-semibold-italic.otf",
    );
    expect(keepNamePath("IBM Plex Sans/IBMPlexSans-Regular.OTF")).toBe(
      "fonts/ibm-plex-sans/ibmplexsans-regular.otf",
    );
  });

  test("normalizes R2 endpoints and Cloudflare account IDs", () => {
    expect(normalizeR2Endpoint("https://abc.r2.cloudflarestorage.com/")).toBe(
      "https://abc.r2.cloudflarestorage.com",
    );
    expect(normalizeR2Endpoint("0123456789abcdef0123456789abcdef")).toBe(
      "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    );
    expect(() => normalizeR2Endpoint("not a url")).toThrow("HTTPS URL");
    expect(() => normalizeR2Endpoint("http://example.r2.cloudflarestorage.com")).toThrow("HTTPS");
  });

  test("reads family, style, and PostScript names from an OpenType name table", () => {
    const bytes = makeOpenType("IBM Plex Sans", "Regular", "IBMPlexSans-Regular");
    expect(readFontNames(bytes, "regular.otf")).toEqual({
      family: "IBM Plex Sans",
      style: "Regular",
      postscriptName: "IBMPlexSans-Regular",
    });
  });

  test("packs a deterministic gzip tar that unpacks under fonts/", async () => {
    const bytes = makeOpenType("IBM Plex Sans", "Regular", "IBMPlexSans-Regular");
    const path = "fonts/ibm-plex-sans/ibm-plex-sans-regular.otf";
    const packed = await packFontArchive([{ path, bytes }]);
    const sidecar = checksumSidecar(packed);
    expect(parseChecksumSidecar(sidecar)).toMatch(/^[0-9a-f]{64}$/);
    expect(sidecar.endsWith("  fonts.tar.gz\n")).toBe(true);

    const unpacked = await unpackFontArchive(packed);
    expect(unpacked.files).toHaveLength(1);
    expect(unpacked.files[0]?.path).toBe(path);
    expect(unpacked.faces[0]?.postscriptName).toBe("IBMPlexSans-Regular");
  });

  test("rejects unsafe archive paths", async () => {
    await expect(
      packFontArchive([
        { path: "../escape.otf", bytes: makeOpenType("A", "Regular", "A-Regular") },
      ]),
    ).rejects.toThrow("outside fonts/");
  });

  test("merges incoming fonts and refuses collisions unless replace is set", async () => {
    const regular = makeOpenType("IBM Plex Sans", "Regular", "IBMPlexSans-Regular");
    const bold = makeOpenType("IBM Plex Sans", "Bold", "IBMPlexSans-Bold");
    const archive = emptyFontArchive();
    const first = planPublish(
      archive,
      [{ sourcePath: "regular.otf", relativePath: "regular.otf", bytes: regular }],
      { replace: false, keepNames: false, allowSystemNames: false },
    );
    expect(first.faces[0]?.change).toBe("added");

    expect(() =>
      planPublish(
        { files: first.files, faces: first.faces },
        [{ sourcePath: "regular.otf", relativePath: "regular.otf", bytes: regular }],
        { replace: false, keepNames: false, allowSystemNames: false },
      ),
    ).toThrow("--replace");

    const replaced = planPublish(
      { files: first.files, faces: first.faces },
      [{ sourcePath: "regular.otf", relativePath: "regular.otf", bytes: regular }],
      { replace: true, keepNames: false, allowSystemNames: false },
    );
    expect(replaced.faces[0]?.change).toBe("replaced");

    const added = planPublish(
      { files: first.files, faces: first.faces },
      [{ sourcePath: "bold.otf", relativePath: "bold.otf", bytes: bold }],
      { replace: false, keepNames: false, allowSystemNames: false },
    );
    expect(added.faces.map((face) => face.change).sort()).toEqual(["added", "unchanged"]);
  });

  test("refuses reserved system families unless allow-system-names is set", () => {
    const helvetica = makeOpenType("Helvetica", "Regular", "Helvetica-Regular");
    expect(() =>
      planPublish(
        emptyFontArchive(),
        [{ sourcePath: "helvetica.ttf", relativePath: "helvetica.ttf", bytes: helvetica }],
        { replace: false, keepNames: false, allowSystemNames: false },
      ),
    ).toThrow("reserved system family");
    expect(
      planPublish(
        emptyFontArchive(),
        [{ sourcePath: "helvetica.ttf", relativePath: "helvetica.ttf", bytes: helvetica }],
        { replace: false, keepNames: false, allowSystemNames: true },
      ).faces,
    ).toHaveLength(1);
  });

  test("removes a family and leaves remaining faces", () => {
    const regular = makeOpenType("IBM Plex Sans", "Regular", "IBMPlexSans-Regular");
    const dank = makeOpenType("Dank Mono", "Italic", "DankMono-Italic");
    const published = planPublish(
      emptyFontArchive(),
      [
        { sourcePath: "regular.otf", relativePath: "regular.otf", bytes: regular },
        { sourcePath: "dank.otf", relativePath: "dank.otf", bytes: dank },
      ],
      { replace: false, keepNames: false, allowSystemNames: false },
    );
    const removed = planRemove(
      { files: published.files, faces: published.faces },
      ["ibm-plex-sans"],
      true,
    );
    expect(removed.files).toHaveLength(1);
    expect(removed.faces.find((face) => face.family === "IBM Plex Sans")?.change).toBe("removed");
    expect(removed.faces.find((face) => face.family === "Dank Mono")?.change).toBe("unchanged");
  });

  test("skips licenses and hidden files when collecting a source directory", async () => {
    const directory = join(tmpdir(), `outfitting-fonts-${crypto.randomUUID()}`);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "LICENSE"), "not a font");
    await writeFile(
      join(directory, ".hidden.otf"),
      makeOpenType("Hidden", "Regular", "Hidden-Regular"),
    );
    await writeFile(
      join(directory, "regular.otf"),
      makeOpenType("IBM Plex Sans", "Regular", "IBMPlexSans-Regular"),
    );
    const incoming = await collectIncomingFonts(directory);
    expect(incoming).toHaveLength(1);
    expect(incoming[0]?.relativePath).toBe("regular.otf");
  });
});
