import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { byorMapPath } from "@/config/paths";
import {
  BYOR_CONTRACT_PATH,
  parseByorContract,
  type ByorContract,
  type ByorProfileDeclaration,
} from "@/source/contract";

function isEnoent(cause: unknown): boolean {
  return (
    cause instanceof Error && "code" in cause && (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/** Read the local profile map. Missing file returns undefined; invalid JSON throws. */
export async function readByorMap(stateRoot: string): Promise<ByorContract | undefined> {
  let raw: string;
  try {
    raw = await readFile(byorMapPath(stateRoot), "utf8");
  } catch (cause) {
    if (isEnoent(cause)) {
      return undefined;
    }
    throw cause;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`${byorMapPath(stateRoot)} is not valid JSON.`, { cause });
  }
  return parseByorContract(parsed as Parameters<typeof parseByorContract>[0]);
}

export function byorMapMissingError(): string {
  return `No local BYOR profile map. Run \`outfitting-manager byor\` to name the remote paths before init.`;
}

/**
 * Merge one profile into the local map and write it.
 * Existing profiles stay. The remote repository is not modified.
 */
export async function writeByorProfile(options: {
  stateRoot: string;
  name: string;
  profile: ByorProfileDeclaration;
  existing?: ByorContract;
}): Promise<ByorContract> {
  const existing = options.existing ?? (await readByorMap(options.stateRoot));
  const profiles = {
    ...existing?.profiles,
    [options.name]: { ...existing?.profiles[options.name], ...options.profile },
  };
  const contract: ByorContract =
    existing?.windows === undefined
      ? { schema: 1, profiles }
      : { schema: 1, windows: existing.windows, profiles };
  const validated = parseByorContract(JSON.parse(JSON.stringify(contract)));
  const path = byorMapPath(options.stateRoot);
  await mkdir(dirname(path), { recursive: true });
  const temporary = await mkdtemp(join(dirname(path), ".byor-map-"));
  try {
    await writeFile(join(temporary, "map.json"), `${JSON.stringify(validated, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(join(temporary, "map.json"), path);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return validated;
}

export interface LocalMapSourceFile {
  path: string;
  body: Uint8Array;
}

/** Copy the local map into the sparse tree so apply and validate read one contract. */
export function localMapAsSourceFile(contract: ByorContract): LocalMapSourceFile {
  const file: LocalMapSourceFile = {
    path: BYOR_CONTRACT_PATH,
    body: new TextEncoder().encode(`${JSON.stringify(contract, null, 2)}\n`),
  };
  return file;
}
