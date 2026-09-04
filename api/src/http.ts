import type { Context } from "hono";
import { Schema } from "effect";

import { encodeResponse } from "@outfitting/contract";

type WorkerContext = Context<{ Bindings: Env }>;

/**
 * Encode a domain value with the shared wire schema, then JSON-respond.
 * Encode failures throw (caught by app.onError → 500).
 */
export function jsonEncoded<A, I>(
  c: WorkerContext,
  schema: Schema.Codec<A, I>,
  value: A,
  status: 200 | 400 | 401 | 404 | 409 | 412 | 500 = 200,
): Response {
  return c.json(encodeResponse(schema, value), status);
}
