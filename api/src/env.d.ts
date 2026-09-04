/** Bindings for the Outfitting API worker (lockfile storage). */
interface Env {
  LOCKFILES: KVNamespace;
  DB: D1Database;
  OUTFITTING_LOCKFILES_TOKEN: SecretsStoreSecret;
}
