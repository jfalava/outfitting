import { Schema } from "effect";

import { Sha256 } from "./literals";

export const ErrorBody = Schema.Struct({
  error: Schema.String,
});
export type ErrorBody = Schema.Schema.Type<typeof ErrorBody>;

export const PushResponse = Schema.Struct({
  hash: Sha256,
  size: Schema.Number,
});
export type PushResponse = Schema.Schema.Type<typeof PushResponse>;

/** PUT lockfile failed CAS: remote head no longer matches If-Match. */
export const StalePushBody = Schema.Struct({
  error: Schema.String,
  current_hash: Schema.NullOr(Sha256),
});
export type StalePushBody = Schema.Schema.Type<typeof StalePushBody>;

export const HistoryEntry = Schema.Struct({
  hash: Sha256,
  size: Schema.Number,
  created_at: Schema.String,
});
export type HistoryEntry = Schema.Schema.Type<typeof HistoryEntry>;

export const HistoryResponse = Schema.Array(HistoryEntry);
export type HistoryResponse = Schema.Schema.Type<typeof HistoryResponse>;

export const KindsResponse = Schema.Array(Schema.String);
export type KindsResponse = Schema.Schema.Type<typeof KindsResponse>;
