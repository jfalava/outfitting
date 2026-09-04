import { Schema } from "effect";

/** Lowercase 64-character SHA-256 hex digest used on the lockfiles wire. */
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export const Sha256 = Schema.String.check(Schema.isPattern(SHA256_HEX_PATTERN));
export type Sha256 = Schema.Schema.Type<typeof Sha256>;
