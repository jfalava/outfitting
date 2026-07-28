# Outfitting lockfiles

This package contains a separate Cloudflare Worker and the lockfile commands
used by `outfitting-manager`. KV stores content-addressed blobs; D1 stores only
the searchable machine, kind, hash, size, and creation time metadata.

## Cloudflare setup

Install the monorepo dependencies and authenticate Wrangler:

```bash
bun install
cd packages/lockfiles
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
bunx wrangler secret put API_TOKEN
```

Apply the schema and deploy:

```bash
bun run migrate:remote
bun run deploy
```

`wrangler deploy` prints the Worker URL. Set it on every client machine:

```bash
export OUTFITTING_LOCKFILES_URL="https://outfitting-lockfiles.<subdomain>.workers.dev"
```

In PowerShell:

```powershell
$env:OUTFITTING_LOCKFILES_URL = "https://outfitting-lockfiles.<subdomain>.workers.dev"
```

For local Worker development, apply the migration locally before starting the
dev server:

```bash
bun run migrate:local
bun run dev
```

## Manager CLI

Install or link the manager binary from the repository:

```bash
cd manager
bun link
```

The first API call prompts for the bearer token and stores it with
`Bun.secrets` using service `outfitting-lockfiles` and name `api-token`. This
uses Keychain on macOS, the Secret Service on Linux, and Credential Manager on
Windows. `Bun.secrets` is experimental and is appropriate here as personal
credential storage, not as a hard boundary between programs running as the
same user.

Push a lockfile:

```bash
outfitting-manager lockfiles push jfalava:x64-wsl nix packages/x64-wsl/flake.lock
outfitting-manager lockfiles push jfalava:aarch64-darwin bun bun.lock
outfitting-manager lockfiles push jfalava:x64-windows winget winget.json
```

Pull the latest version:

```bash
outfitting-manager lockfiles pull jfalava:x64-wsl nix
outfitting-manager lockfiles pull jfalava:x64-windows winget restored-winget.json
```

The default output filename is inferred for common kinds: `nix`, `flake`,
`bun`, `npm`, `package-lock`, `homebrew`, `brew`, `brewfile`, and `winget`.
Pass an explicit output path for any other free-form kind.

List kinds and inspect history:

```bash
outfitting-manager lockfiles list jfalava:aarch64-darwin
outfitting-manager lockfiles history jfalava:aarch64-darwin nix
```

Machine names are free-form. Automatic maintenance hooks use the repository's
`username:platform` convention. The current Windows hook uses:

- `jfalava:x64-windows`

The macOS and WSL labels are reserved for later integration. Kinds are also
free-form and require no schema migration.

## HTTP API

Every request requires `Authorization: Bearer <API_TOKEN>`.

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
