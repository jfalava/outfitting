# Outfitting IaC

Alchemy stack for the edge router, API, docs, and installer workers.

## Scripts

| Script | Purpose |
| ------ | ------- |
| `bun run ci:build` | Typecheck `iac` + build docs (`docs/scripts/build-cf.sh`) for CI / Workers Builds |
| `bun run ci:deploy` | `alchemy deploy --yes --adopt` (non-interactive remote deploy) |
| `bun run deploy` | Interactive Alchemy deploy |
| `bun run plan` | Alchemy plan |
| `bun run destroy` | Tear down stack resources Alchemy owns |

From the monorepo root the same entrypoints exist as `bun run ci:build` / `bun run ci:deploy`.

## Cloudflare Workers Builds

Suggested commands:

- **Install:** `bun install --frozen-lockfile`
- **Build:** `bun run ci:build`
- **Deploy:** `bun run ci:deploy`

Ensure build env has Cloudflare credentials Alchemy expects (same account as local `wrangler` OAuth / `CLOUDFLARE_API_TOKEN`). Optional `OUTFITTING_LOCKFILES_TOKEN` in env if the Secrets Store secret must be provisioned.
