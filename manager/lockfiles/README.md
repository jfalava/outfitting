# Outfitting lockfiles

This package contains the Cloudflare Worker used by `outfitting-manager`.
KV stores content-addressed blobs; D1 stores only the searchable machine, kind,
hash, size, and creation time metadata.

## Cloudflare setup

Install the monorepo dependencies and authenticate Wrangler:

```bash
bun install
cd manager/lockfiles
bunx wrangler login
```

Create the D1 database and KV namespace:

```bash
bunx wrangler d1 create outfitting-lockfiles --location=weur
bunx wrangler kv namespace create outfitting-lockfiles
```

Copy the returned D1 `database_id` and KV namespace `id` into
`wrangler.jsonc`, replacing the two `REPLACE_WITH_...` values. The Worker uses
the bindings `DB` and `LOCKFILES`; these are intentionally separate from the
installer Worker's bindings.

Set the shared bearer token as a Worker secret:

```bash
bunx wrangler secret put OUTFITTING_LOCKFILES_TOKEN
```

Apply the schema and deploy:

```bash
bun run migrate:remote
bun run deploy
```

`wrangler deploy` prints the Worker URL. Configure it in the [manager CLI](../cli/README.md).

For local Worker development, apply the migration locally before starting the
dev server:

```bash
bun run migrate:local
bun run dev
```

## HTTP API

Every request requires
`Authorization: Bearer <OUTFITTING_LOCKFILES_TOKEN>`.

| Method   | Route                               | Result                                               |
| -------- | ----------------------------------- | ---------------------------------------------------- |
| `PUT`    | `/lockfiles/:machine/:kind`         | Stores the raw body and returns `{ hash, size }`     |
| `GET`    | `/lockfiles/:machine/:kind`         | Returns the latest raw content as text               |
| `GET`    | `/lockfiles/:machine/:kind/history` | Returns `{ hash, size, created_at }[]`, newest first |
| `GET`    | `/lockfiles/:machine`               | Returns a sorted JSON array of tracked kinds         |
| `DELETE` | `/lockfiles/:machine/:kind/:hash`   | Deletes one D1 row and its KV blob                   |

The blob key format is
`lockfile:{machine}:{kind}:{sha256-of-content}`. Re-uploading the same content
for the same machine and kind returns its existing hash and size without adding
a history row.

## Homebrew note

Homebrew does not create or support a `Brewfile.lock.json`. The macOS
integration can later use `brew bundle dump` to capture installed Homebrew
state as a temporary `Brewfile` snapshot and push it with kind `homebrew`.
