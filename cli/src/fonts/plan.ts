import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import type { ArchiveFile, FontArchive } from "@/fonts/archive";
import { RESERVED_FAMILIES } from "@/fonts/constants";
import {
  archivePathFor,
  fontExtension,
  keepNamePath,
  readFontNames,
  slugifyName,
  type FontFace,
} from "@/fonts/names";

export type FaceChange = "added" | "replaced" | "removed" | "unchanged";

export interface PlannedFace extends FontFace {
  readonly change: FaceChange;
}

export interface FontPlan {
  readonly files: ReadonlyArray<ArchiveFile>;
  readonly faces: ReadonlyArray<PlannedFace>;
}

export interface IncomingFont {
  readonly sourcePath: string;
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

export interface PublishOptions {
  readonly replace: boolean;
  readonly keepNames: boolean;
  readonly allowSystemNames: boolean;
}

const SKIP_NAME_PREFIXES = [".", "._"];
const SKIP_BASENAMES = new Set(["license", "licence", "readme", "copying", "authors", "notice"]);

function familyStyleKey(family: string, style: string): string {
  return `${family.toLowerCase()}\0${style.toLowerCase()}`;
}

function isReservedFamily(family: string): boolean {
  return RESERVED_FAMILIES.some((reserved) => reserved.toLowerCase() === family.toLowerCase());
}

function shouldSkipSource(relativePath: string): boolean {
  const parts = relativePath.split("/");
  if (parts.some((part) => SKIP_NAME_PREFIXES.some((prefix) => part.startsWith(prefix)))) {
    return true;
  }
  const base = parts.at(-1)?.toLowerCase() ?? "";
  const stem = base.replace(/\.[^.]+$/, "");
  return SKIP_BASENAMES.has(stem);
}

export async function collectIncomingFonts(directory: string): Promise<IncomingFont[]> {
  const collected: IncomingFont[] = [];

  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) {
          continue;
        }
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relativePath = relative(directory, fullPath).replaceAll("\\", "/");
      if (shouldSkipSource(relativePath) || fontExtension(relativePath) === undefined) {
        continue;
      }
      collected.push({
        sourcePath: fullPath,
        relativePath,
        bytes: new Uint8Array(await readFile(fullPath)),
      });
    }
  };

  await walk(directory);
  if (collected.length === 0) {
    throw new Error(`No OpenType fonts found in ${directory}.`);
  }
  return collected;
}

function incomingFace(
  incoming: IncomingFont,
  keepNames: boolean,
): { file: ArchiveFile; face: FontFace } {
  const names = readFontNames(incoming.bytes, incoming.sourcePath);
  const extension = fontExtension(incoming.relativePath);
  if (extension === undefined) {
    throw new Error(`Unsupported font extension: ${incoming.sourcePath}`);
  }
  const path = keepNames
    ? keepNamePath(incoming.relativePath)
    : archivePathFor(names.family, names.style, extension);
  return { file: { path, bytes: incoming.bytes }, face: { ...names, path } };
}

function assertIncomingCollisions(faces: ReadonlyArray<FontFace>, allowSystemNames: boolean): void {
  const byPath = new Map<string, FontFace>();
  const byPostscript = new Map<string, FontFace>();
  const byFamilyStyle = new Map<string, FontFace>();

  for (const face of faces) {
    if (!allowSystemNames && isReservedFamily(face.family)) {
      throw new Error(
        `Refusing reserved system family "${face.family}". Pass --allow-system-names to override.`,
      );
    }
    const existingPath = byPath.get(face.path);
    if (existingPath !== undefined) {
      throw new Error(`Incoming fonts collide on archive path ${face.path}.`);
    }
    byPath.set(face.path, face);

    const existingPostscript = byPostscript.get(face.postscriptName);
    if (existingPostscript !== undefined && existingPostscript.path !== face.path) {
      throw new Error(
        `Incoming fonts collide on PostScript name ${face.postscriptName} (${existingPostscript.path} vs ${face.path}).`,
      );
    }
    byPostscript.set(face.postscriptName, face);

    const familyStyle = familyStyleKey(face.family, face.style);
    const existingFamilyStyle = byFamilyStyle.get(familyStyle);
    if (existingFamilyStyle !== undefined && existingFamilyStyle.path !== face.path) {
      throw new Error(
        `Incoming fonts collide on ${face.family} ${face.style} (${existingFamilyStyle.path} vs ${face.path}).`,
      );
    }
    byFamilyStyle.set(familyStyle, face);
  }
}

function assertMergeCollisions(current: FontFace, incoming: FontFace, replace: boolean): void {
  if (current.path === incoming.path) {
    if (!replace) {
      throw new Error(`Archive already contains ${incoming.path}. Pass --replace to overwrite.`);
    }
    return;
  }
  if (current.postscriptName === incoming.postscriptName) {
    throw new Error(
      `PostScript name ${incoming.postscriptName} already exists at ${current.path}.`,
    );
  }
  if (
    familyStyleKey(current.family, current.style) ===
    familyStyleKey(incoming.family, incoming.style)
  ) {
    throw new Error(`${incoming.family} ${incoming.style} already exists at ${current.path}.`);
  }
}

export function planPublish(
  archive: FontArchive,
  incomingFonts: ReadonlyArray<IncomingFont>,
  options: PublishOptions,
): FontPlan {
  const incoming = incomingFonts.map((font) => incomingFace(font, options.keepNames));
  assertIncomingCollisions(
    incoming.map((entry) => entry.face),
    options.allowSystemNames,
  );

  const files = new Map(archive.files.map((file) => [file.path, file]));
  const faces = new Map(archive.faces.map((face) => [face.path, face]));
  const changes = new Map<string, FaceChange>(
    archive.faces.map((face) => [face.path, "unchanged"]),
  );

  for (const entry of incoming) {
    for (const current of faces.values()) {
      assertMergeCollisions(current, entry.face, options.replace);
    }
    const existed = files.has(entry.file.path);
    files.set(entry.file.path, entry.file);
    faces.set(entry.face.path, entry.face);
    changes.set(entry.face.path, existed ? "replaced" : "added");
  }

  const plannedFaces = [...faces.values()]
    .map((face) => ({ ...face, change: changes.get(face.path) ?? "unchanged" }))
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    files: [...files.values()].sort((left, right) => left.path.localeCompare(right.path)),
    faces: plannedFaces,
  };
}

function matchesRemoveTarget(face: FontFace, target: string, family: boolean): boolean {
  if (family) {
    return (
      slugifyName(face.family) === slugifyName(target) ||
      face.family.toLowerCase() === target.toLowerCase()
    );
  }
  return (
    face.path === target ||
    face.postscriptName === target ||
    `${face.family} ${face.style}` === target ||
    slugifyName(face.family) === slugifyName(target)
  );
}

export function planRemove(
  archive: FontArchive,
  targets: ReadonlyArray<string>,
  family: boolean,
): FontPlan {
  if (targets.length === 0) {
    throw new Error("Provide at least one font name to remove.");
  }

  const remainingFiles: ArchiveFile[] = [];
  const remainingFaces: PlannedFace[] = [];
  const matched = new Set<string>();

  for (const face of archive.faces) {
    const hit = targets.find((target) => matchesRemoveTarget(face, target, family));
    if (hit === undefined) {
      const file = archive.files.find((candidate) => candidate.path === face.path);
      if (file === undefined) {
        throw new Error(`Archive is missing bytes for ${face.path}.`);
      }
      remainingFiles.push(file);
      remainingFaces.push({ ...face, change: "unchanged" });
      continue;
    }
    matched.add(hit);
    remainingFaces.push({ ...face, change: "removed" });
  }

  const unmatched = targets.filter((target) => !matched.has(target));
  if (unmatched.length > 0) {
    throw new Error(`No matching fonts for: ${unmatched.join(", ")}`);
  }
  if (remainingFiles.length === 0) {
    throw new Error("Refusing to publish an empty font archive.");
  }

  return {
    files: remainingFiles.sort((left, right) => left.path.localeCompare(right.path)),
    faces: remainingFaces.sort((left, right) => left.path.localeCompare(right.path)),
  };
}
