import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Schema } from "effect";

import { normalizeGitRepository, validateGitRef } from "@/config/git";
import { parseByorContract, type ByorContract } from "@/source/contract";

export interface ByorMap extends ByorContract {
  repository: string;
  ref: string;
}

function byorMapPath(stateRoot: string): string {
  return join(stateRoot, "byor.json");
}

const ByorMapEnvelopeSchema = Schema.Struct({
  repository: Schema.String,
  ref: Schema.String,
  schema: Schema.Literal(1),
  windows: Schema.optionalKey(Schema.MutableJson),
  profiles: Schema.MutableJson,
});

const decodeByorMapEnvelope = Schema.decodeUnknownSync(ByorMapEnvelopeSchema);

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
