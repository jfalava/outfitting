# Agent Guidelines for Outfitting Monorepo

This is a cross-platform bootstrap system using Cloudflare Workers, Bun, and TypeScript.

## Build/Test/Lint Commands

**Root level:**

```bash
# Check workspace catalog compliance
bun run check:catalog

# Check for outdated catalog dependencies
bun run check:outdated

# Format all workspace packages
bun run format:global
```

**Documentation app (`documentation/`):**

```bash
bun run dev          # Start dev server on port 3000
bun run build        # Build for production
bun run deploy       # Full deploy pipeline (types → lint → build → deploy)
bun run check        # Run all checks (types + lint + format)
bun run typecheck    # TypeScript type checking only (tsgo)
bun run lint         # Run oxlint with type-aware rules
bun run format       # Run oxfmt formatter
bun run cf-typegen   # Generate Cloudflare types
```

**Installer Worker (`installer/`):**

```bash
bun run dev          # Start wrangler dev server
bun run deploy       # Full deploy pipeline
bun run check        # Run all checks
bun run typecheck    # TypeScript type checking
bun run lint         # Run oxlint
bun run format       # Run oxfmt
bun run cf-typegen   # Generate Cloudflare types
```

## Code Style Guidelines

**Language & Runtime:**

- TypeScript 5.9+ with strict mode enabled
- ES2024 target, ESNext modules
- Bun as package manager and runtime (`bun.lock` present)
- React 19 for UI components

**Formatting (oxfmt):**

- Print width: 100
- Tab width: 2 spaces (no tabs)
- LF line endings
- Semicolons required
- Double quotes for strings
- Trailing commas: all
- Final newline required

**Linting (oxlint):**

- Type-aware linting enabled (`--type-aware`)
- Plugins: eslint, react, typescript, jsx-a11y, unicorn, oxc, import, promise
- No `console.log` (only `console.warn` and `console.error` allowed)
- No `any` types allowed (`typescript/no-explicit-any: error`)
- No unused variables (prefix with `_` to ignore)
- No var, prefer const
- Strict equality (`eqeqeq: always`)
- Max complexity: 12, max depth: 4, max params: 5, max statements: 40

**Import Organization (oxfmt experimental):**

```
1. side-effect imports
2. builtin modules
3. external dependencies + types
4. internal aliases (@/, ~/) + types
5. parent imports
6. sibling imports
7. index imports
```

**Naming Conventions:**

- Functions: camelCase (`fetchScript`, `setScriptHeaders`)
- Components: PascalCase (`IndexPage`, `RootDocument`)
- Constants: UPPER_SNAKE_CASE for primitives, camelCase for objects/arrays
- Types/Interfaces: PascalCase with descriptive names
- Files: camelCase for utilities, PascalCase for components
- Prefix unused variables with `_`

**TypeScript Patterns:**

- Use `type` for type aliases (not `interface`)
- Explicit return types on exported functions
- Use `as const` for literal object types
- Path alias `@/` maps to `./src/`
- No unchecked side-effect imports
- No fallthrough cases in switch statements

**React Patterns:**

- Functional components only
- File-based routing with TanStack Router
- Route files in `src/routes/`
- Route components exported as `Route` using `createFileRoute()`
- Use `react-jsx` transform (no need to import React)
- `jsx-a11y` rules enforced

**Error Handling:**

- Explicit error handling, no silent failures
- Return `null` for missing data in utilities
- Use HTTP 418 "I'm a teapot" for unauthorized access
- Validate inputs at function boundaries

**Worker/Server Patterns:**

- Hono for Worker routing
- Middleware for cross-cutting concerns (auth, logging)
- Domain-based routing for multi-tenant workers
- Environment validation at startup

**Shell Scripts:**

- Bash scripts: `set -euo pipefail`
- PowerShell scripts: Strict mode with error handling
- Use color-coded output functions
- Backup existing files before overwriting

## Workspace Catalog Rules

Dependencies declared in root `workspaces.catalog` MUST use `"catalog:"` version in workspace packages:

```json
"dependencies": {
  "typescript": "catalog:build",
  "@types/node": "catalog:types"
}
```

Run `bun run check:catalog` to validate compliance.

## File Structure

```
repo/
├── documentation/     # Fumadocs + TanStack Start app
│   ├── src/
│   │   ├── routes/    # File-based routes
│   │   ├── lib/       # Shared utilities
│   │   └── app.tsx    # Root app component
│   └── wrangler.jsonc # Cloudflare config
├── installer/         # Cloudflare Worker (Hono)
│   ├── src/
│   │   ├── index.ts   # Worker entry
│   │   ├── *.ts       # Platform handlers
│   │   └── constants.ts
│   └── wrangler.jsonc
├── scripts/           # Monorepo maintenance scripts
├── packages/          # Package manifests per platform
└── dotfiles/          # Shell/editor configs
```

## Before Committing

1. Run `bun run check` in affected workspace
2. Ensure `oxlint --type-aware` passes
3. Ensure `tsgo --noEmit` passes
4. Ensure `oxfmt` produces no changes
5. Verify catalog compliance: `bun run check:catalog`
