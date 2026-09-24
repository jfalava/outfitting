import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Schema } from "effect";

import { byorMapPath } from "@/config/paths";
import {
  BYOR_CONTRACT_PATH,
  parseByorContract,
  type ByorContract,
  type ByorProfileDeclaration,
} from "@/source/contract";

export interface ByorMap extends ByorContract {
  repository: string;
  ref: string;
}

const ByorMapEnvelopeSchema = Schema.Struct({
  repository: Schema.String,
  ref: Schema.String,
  schema: Schema.Literal(1),
  windows: Schema.optionalKey(Schema.MutableJson),
  profiles: Schema.MutableJson,
});

const decodeByorMapEnvelope = Schema.decodeUnknownSync(ByorMapEnvelopeSchema);

export function normalizeGitRepository(value: string): string {
  const repository = value.trim();
  if (repository.length === 0 || repository.startsWith("-") || /[\s\0]/.test(repository)) {
    throw new Error("Repository must be a Git remote URL or SSH-style Git address.");
  }

  const scpAddress = /^(?:[^@/:]+@)?[^:/]+:.+$/;
  if (scpAddress.test(repository)) {
    return repository;
  }

  let url: URL;
  try {
    url = new URL(repository);
  } catch {
    throw new Error("Repository must be a Git remote URL or SSH-style Git address.");
  }
  if (
    !["https:", "http:", "ssh:", "git:"].includes(url.protocol) ||
    url.hostname.length === 0 ||
    url.pathname === "/" ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("Repository must be a Git remote URL or SSH-style Git address.");
  }
  return repository.replace(/\/+$/, "");
}

export function validateGitRef(value: string): string {
  const ref = value.trim();
  if (ref.length === 0 || ref.startsWith("-") || /[\s\0]/.test(ref)) {
    throw new Error("Git ref must be non-empty and cannot begin with '-'.");
  }
  return ref;
}

function isEnoent(cause: unknown): boolean {
  return (
    cause instanceof Error && "code" in cause && (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/** Read the local remote-source and profile map. Missing file returns undefined. */
export async function readByorMap(stateRoot: string): Promise<ByorMap | undefined> {
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
  let envelope: ReturnType<typeof decodeByorMapEnvelope>;
  try {
    envelope = decodeByorMapEnvelope(parsed);
  } catch (cause) {
    throw new Error(`${byorMapPath(stateRoot)} must define a Git repository, ref, and BYOR map.`, {
      cause,
    });
  }
  const repository = normalizeGitRepository(envelope.repository);
  const ref = validateGitRef(envelope.ref);
  const contract =
    envelope.windows === undefined
      ? parseByorContract({ schema: envelope.schema, profiles: envelope.profiles })
      : parseByorContract({
          schema: envelope.schema,
          windows: envelope.windows,
          profiles: envelope.profiles,
        });
  return { ...contract, repository, ref };
}

export function byorMapMissingError(): string {
  return `No local BYOR source is configured. Run \`outfitting-manager byor\` to select a Git repository and declare its profile paths.`;
}

/**
 * Merge one profile into the local map and write it.
 * Existing profiles stay. The remote repository is not modified.
 */
export async function writeByorProfile(options: {
  stateRoot: string;
  name: string;
  profile: ByorProfileDeclaration;
  repository?: string;
  ref?: string;
  existing?: ByorMap;
}): Promise<ByorMap> {
  const existing = options.existing ?? (await readByorMap(options.stateRoot));
  const repositoryValue = options.repository ?? existing?.repository;
  const refValue = options.ref ?? existing?.ref;
  if (repositoryValue === undefined || refValue === undefined) {
    throw new Error("A Git repository and ref are required to configure a BYOR source.");
  }
  const repository = normalizeGitRepository(repositoryValue);
  const ref = validateGitRef(refValue);
  const profiles = {
    ...existing?.profiles,
    [options.name]: { ...existing?.profiles[options.name], ...options.profile },
  };
  const contract: ByorContract =
    existing?.windows === undefined
      ? { schema: 1, profiles }
      : { schema: 1, windows: existing.windows, profiles };
  const validated = parseByorContract(JSON.parse(JSON.stringify(contract)));
  const map: ByorMap = { ...validated, repository, ref };
  const path = byorMapPath(options.stateRoot);
  await mkdir(dirname(path), { recursive: true });
  const temporary = await mkdtemp(join(dirname(path), ".byor-map-"));
  try {
    await writeFile(join(temporary, "map.json"), `${JSON.stringify(map, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(join(temporary, "map.json"), path);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return map;
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
