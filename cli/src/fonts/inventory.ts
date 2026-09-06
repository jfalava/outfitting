import { decodeResponse, encodeResponse, isJsonValue, Sha256 } from "@outfitting/contract";
import { Schema } from "effect";

import {
  FONT_ARCHIVE_KEY,
  INVENTORY_FORMAT,
  INVENTORY_KIND,
  INVENTORY_MACHINE,
} from "@/fonts/constants";
import type { FontFace } from "@/fonts/names";
import { request } from "@/lockfiles/request";

const InventoryFaceSchema = Schema.Struct({
  family: Schema.String,
  style: Schema.String,
  postscriptName: Schema.String,
  path: Schema.String,
});

const InventorySchema = Schema.Struct({
  format: Schema.Literal(INVENTORY_FORMAT),
  archive: Schema.Struct({
    key: Schema.Literal(FONT_ARCHIVE_KEY),
    sha256: Sha256,
    size: Schema.Number,
  }),
  faces: Schema.Array(InventoryFaceSchema),
});

export type PrivateFontsInventory = Schema.Schema.Type<typeof InventorySchema>;

export interface InventorySnapshot {
  readonly inventory: PrivateFontsInventory;
  readonly hash: string;
}

export function quotedHash(etag: string | null): string | undefined {
  const match = etag?.match(/^(?:W\/)?"([0-9a-f]{64})"$/i);
  return match?.[1]?.toLowerCase();
}

export function inventoryFromFaces(
  faces: ReadonlyArray<FontFace>,
  sha256: string,
  size: number,
): PrivateFontsInventory {
  return {
    format: INVENTORY_FORMAT,
    archive: {
      key: FONT_ARCHIVE_KEY,
      sha256,
      size,
    },
    faces: [...faces]
      .map((face) => ({
        family: face.family,
        style: face.style,
        postscriptName: face.postscriptName,
        path: face.path,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  };
}

export function encodeInventory(inventory: PrivateFontsInventory): Uint8Array {
  const encoded = encodeResponse(InventorySchema, inventory);
  return new TextEncoder().encode(`${JSON.stringify(encoded, null, 2)}\n`);
}

export function inventoriesEqual(
  left: PrivateFontsInventory,
  right: PrivateFontsInventory,
): boolean {
  if (
    left.format !== right.format ||
    left.archive.key !== right.archive.key ||
    left.archive.sha256 !== right.archive.sha256 ||
    left.archive.size !== right.archive.size ||
    left.faces.length !== right.faces.length
  ) {
    return false;
  }
  return left.faces.every((face, index) => {
    const other = right.faces[index];
    return (
      other !== undefined &&
      face.family === other.family &&
      face.style === other.style &&
      face.postscriptName === other.postscriptName &&
      face.path === other.path
    );
  });
}

export async function pullInventory(): Promise<InventorySnapshot | undefined> {
  try {
    const response = await request(["lockfiles", INVENTORY_MACHINE, INVENTORY_KIND]);
    const raw: unknown = JSON.parse(await response.text());
    if (!isJsonValue(raw)) {
      throw new Error("Private fonts inventory is not valid JSON.");
    }
    const inventory = decodeResponse(InventorySchema, raw, "private-fonts");
    if (inventory === undefined) {
      throw new Error("Private fonts inventory has an invalid format.");
    }
    const hash = quotedHash(response.headers.get("ETag"));
    if (hash === undefined) {
      throw new Error("Private fonts inventory is missing a SHA-256 ETag.");
    }
    return { inventory, hash };
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("Worker returned 404:")) {
      return undefined;
    }
    throw cause;
  }
}

export async function pushInventory(
  inventory: PrivateFontsInventory,
  ifMatch: string | undefined,
): Promise<void> {
  type RequestHeaders = Record<string, string>;
  const headers: RequestHeaders = {
    "Content-Type": "text/plain; charset=utf-8",
  };
  if (ifMatch !== undefined) {
    headers["If-Match"] = `"${ifMatch}"`;
  }
  const bytes = encodeInventory(inventory);
  await request(["lockfiles", INVENTORY_MACHINE, INVENTORY_KIND], {
    method: "PUT",
    body: bytes,
    headers,
  });
}
