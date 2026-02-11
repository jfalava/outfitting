# Documentation App

Fumadocs + TanStack Start documentation site for the Outfitting project.

This app contains:

- MDX docs content in `content/docs`
- custom docs route rendering with Fumadocs layouts
- Worker-backed search endpoint at `/api/search`
- Cloudflare-compatible build/deploy setup

## Tech Stack

- TanStack Start + TanStack Router
- Fumadocs UI + Fumadocs MDX
- Tailwind CSS v4
- Cloudflare Vite plugin + Wrangler

## Content Structure

- `content/docs/*.mdx`: docs pages
- `content/docs/meta.json`: page order
- `src/lib/docs-tree.ts`: sidebar tree definition
- `src/routes/docs/$.tsx`: docs page loader and renderer

## Search

Search is enabled via Fumadocs provider configuration and backed by a server route:

- API route: `src/routes/api.search.ts`
- Endpoint: `GET /api/search?query=<term>`
- Index source: generated MDX collections (`fumadocs-mdx:collections/server`)

## Local Development

```bash
cd documentation
bun install
bun run dev
```

Useful commands:

```bash
bun run typecheck
bun run lint
bun run format
bun run check
bun run build
```

## Deploy

```bash
bun run deploy
```
