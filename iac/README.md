# Outfitting IaC

Alchemy stack for the edge router, API, optional docs, and installer workers.

Resource Cloudflare names default to `outfitting-*` and are overridable per deploy so any account can provision an isolated stack without colliding with another deployment.

## Scripts

| Script              | Purpose                                                                           |
| ------------------- | --------------------------------------------------------------------------------- |
| `bun run ci:build`  | Typecheck `iac` + build docs (`docs/scripts/build-cf.sh`) for CI / Workers Builds |
| `bun run ci:deploy` | `alchemy deploy --yes --adopt` (non-interactive remote deploy)                    |
| `bun run deploy`    | Interactive Alchemy deploy                                                        |
| `bun run plan`      | Alchemy plan                                                                      |
| `bun run destroy`   | Tear down stack resources Alchemy owns                                            |
| `bun run test`      | Deploy-config unit tests                                                          |

From the monorepo root the same entrypoints exist as `bun run ci:build` / `bun run ci:deploy` / `bun run deploy`.

## Dynamic naming + skip docs

Precedence for every field: **CLI flags → env → `outfitting.deploy.json` → defaults**.

Copy the example and edit:

```bash
cp iac/outfitting.deploy.example.json outfitting.deploy.json
```

| Field / env                                       | Default                     | Notes                                      |
| ------------------------------------------------- | --------------------------- | ------------------------------------------ |
| `stackName` / `OUTFITTING_STACK_NAME`             | `Outfitting`                | Alchemy stack id                           |
| `workers.router` / `OUTFITTING_ROUTER_NAME`       | `outfitting-router`         | Public edge worker                         |
| `workers.api` / `OUTFITTING_API_NAME`             | `outfitting-api`            | Lockfiles API                              |
| `workers.docs` / `OUTFITTING_DOCS_NAME`           | `outfitting-docs`           | Omitted entirely when docs are skipped     |
| `workers.installer` / `OUTFITTING_INSTALLER_NAME` | `outfitting-installer`      | Platform install hosts                     |
| `database` / `OUTFITTING_DB_NAME`                 | `outfitting-lockfiles`      | D1                                         |
| `kv` / `OUTFITTING_KV_TITLE`                      | `outfitting-lockfiles`      | KV title                                   |
| `domain` / `OUTFITTING_DOMAIN`                    | `outfitting.jfa.dev`        | Empty string / unset via env clears domain |
| `docs` / `OUTFITTING_DEPLOY_DOCS`                 | `true`                      | `false` / `0` / `--no-docs` skips docs     |
| `installerHosts` / `OUTFITTING_INSTALLER_HOSTS`   | `win/wsl/mac/nixos.jfa.dev` | Comma-separated aliases                    |

Provision via the manager CLI (recommended):

```bash
# Skip docs + custom worker prefix
bun run cli/index.ts provision --no-docs \
  --api-name outfitting-api-dev \
  --router-name outfitting-router-dev \
  --stack-name OutfittingDev

# Or point at a config file
bun run cli/index.ts provision --config ./outfitting.deploy.json
```

Direct Alchemy (env-driven):

```bash
export OUTFITTING_DEPLOY_DOCS=0
export OUTFITTING_API_NAME=outfitting-api-dev
CI=1 bun run deploy -- --yes --adopt
```

When docs are skipped the router has no `DOCS_WORKER` binding; docs allowlist paths return HTTP 404 and unknown apex paths still return 418.

## Cloudflare Workers Builds

Suggested commands:

- **Install:** `bun install --frozen-lockfile`
- **Build:** `bun run ci:build`
- **Deploy:** `bun run ci:deploy`

Ensure build env has Cloudflare credentials Alchemy expects (same account as local `wrangler` OAuth / `CLOUDFLARE_API_TOKEN`). Optional `OUTFITTING_LOCKFILES_TOKEN` in env if the Secrets Store secret must be provisioned.
