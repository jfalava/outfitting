import { Schema } from "effect";

import type { JsonValue } from "./json";

/**
 * Encode a domain value to its wire JSON shape.
 * Server-side: fail closed — a SchemaError means we almost shipped garbage.
 */
export const encodeResponse = <A, I>(schema: Schema.Codec<A, I>, value: A): I =>
  Schema.encodeSync(schema)(value);

/**
 * Decode wire JSON into a domain value.
 * Client-side helper: returns undefined and logs on failure (graceful).
 */
export const decodeResponse = <A, I>(
  schema: Schema.Codec<A, I>,
  body: JsonValue,
  label: string,
): A | undefined => {
  try {
    return Schema.decodeUnknownSync(schema)(body);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[outfitting/contract] decode failed:${label}:${message}`);
    return undefined;
  }
};
