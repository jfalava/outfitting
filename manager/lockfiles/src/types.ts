import type { Hono } from "hono";

export interface Bindings {
  OUTFITTING_LOCKFILES_TOKEN: SecretsStoreSecret;
  DB: D1Database;
  LOCKFILES: KVNamespace;
}

export interface AppEnv {
  Bindings: Bindings;
}

export type LockfilesApp = Hono<AppEnv>;

export interface LockfileRow {
  hash: string;
  size: number;
  created_at: string;
}

export interface KindRow {
  kind: string;
}

export interface HeadRow {
  hash: string;
}

export interface LockfileIdRow {
  id: number;
}

export type PromotionResult = { status: "ok" } | { currentHash: string | null; status: "stale" };

export interface PromotionInput {
  content: ArrayBuffer;
  hash: string;
  kind: string;
  machine: string;
  parentHash?: string;
  size: number;
}

export type DeleteLockfileResult = "current" | "deleted" | "not-found";
