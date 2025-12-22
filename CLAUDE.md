# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Outfitting is a multi-platform development environment provisioning system with three main components:

1. **Cloudflare Worker** (installer/) - Hono-based routing worker serving installation scripts via custom domains (win.jfa.dev, wsl.jfa.dev, mac.jfa.dev)
2. **Nix Configurations** (packages/) - Platform-specific Nix flakes and Home Manager configurations
3. **Installation Scripts** (root) - Shell and PowerShell scripts that bootstrap environments

## Architecture

### Cloudflare Worker (installer/)

A TypeScript Hono application deployed to Cloudflare Workers that:
- Routes requests based on subdomain (win/wsl/mac.jfa.dev) to platform-specific handlers
- Fetches installation scripts from GitHub raw content
- Serves dotfiles and package lists
- Each platform handler (windows.ts, wsl.ts, macos.ts) is a separate Hono sub-app

**Key files:**
- `src/index.ts` - Main router with domain-based middleware
- `src/constants.ts` - GitHub URLs, allowed hosts, content types
- `src/utils.ts` - Fetch helpers with security headers
- `src/{windows,wsl,macos}.ts` - Platform-specific route handlers

### Nix Flake Architecture

**WSL/Linux (packages/x64-linux/):**
- `flake.nix` - Home Manager flake with composition pattern
- Defines three configurations:
  - `jfalava-personal` (base.nix)
  - `jfalava-work` (base.nix + work.nix)
  - `jfalava` (alias to personal)
- `base.nix` - Core packages and dotfiles (uses absolute path to repo via `outfittingRepo` variable)
- `work.nix` - Additional work-specific packages/configs

**macOS (packages/aarch64-darwin/):**
- `flake.nix` - Combined nix-darwin + Home Manager flake
- `darwin.nix` - System-level macOS configuration
- `home.nix` - User-level Home Manager configuration
- Configurations: `macos`, `jfa-mac-mini`, `default`

**Critical concept:** WSL/Linux uses flake composition (extending base with work modules), while macOS uses a single unified configuration.

### Windows Package Management (packages/x64-windows/)

Text files listing WinGet package IDs and Microsoft Store packages:
- `base.txt`, `dev.txt`, `gaming.txt`, `work.txt`, `qol.txt`, `network.txt` - WinGet packages
- `msstore-*.txt` - Microsoft Store app IDs
- `pwsh-modules.txt` - PowerShell modules

Installation script dynamically combines these based on profile selection (e.g., `win.jfa.dev/dev+gaming+qol`).

### Repository Symlinking Pattern

Installation scripts create symlinks from standard config locations to this repository:
- WSL: `~/.config/home-manager` → `~/Workspace/outfitting/packages/x64-linux`
- macOS: `~/.config/home-manager` → `~/Workspace/outfitting/packages/aarch64-darwin`

This allows editing Nix configs in the repo directory and version controlling changes.

## Common Commands

### Cloudflare Worker Development

```bash
cd installer
bun install                          # Install dependencies
bun run dev                          # Start local Wrangler dev server
bun run check                        # Type check + lint
bun run deploy                       # Full CI pipeline: typegen → typecheck → lint → format → deploy
```

**Test commands:**
```bash
bun run cf-typegen                   # Generate Cloudflare Worker types
bun run typecheck                    # Run tsgo type checker
bun run lint                         # Run oxlint with type-aware checks
bun run format                       # Format with oxfmt
```

### Nix Configuration Testing (WSL/Linux)

```bash
cd packages/x64-linux

# Test personal config build (without activating)
nix build .#homeConfigurations.jfalava-personal.activationPackage

# Test work config build
nix build .#homeConfigurations.jfalava-work.activationPackage

# Apply personal configuration
home-manager switch --flake .#jfalava-personal

# Apply work configuration
home-manager switch --flake .#jfalava-work

# Build with impure mode (required for absolute repo paths in base.nix)
home-manager switch --flake .#jfalava-personal --impure
```

### Nix Configuration Testing (macOS)

```bash
cd packages/aarch64-darwin

# Test nix-darwin build (without activating)
darwin-rebuild build --flake ".#macos"

# Apply configuration
darwin-rebuild switch --flake ".#macos"

# Test Home Manager only
nix build .#homeConfigurations.macos.activationPackage
home-manager switch --flake .#macos
```

### Installation Script Testing

**Windows (from PowerShell):**
```powershell
# Test base profile installation
irm win.jfa.dev | iex

# Test custom combination
irm win.jfa.dev/dev+gaming+qol | iex

# Test PowerShell profile update
irm win.jfa.dev/config/pwsh-profile | iex
```

**WSL/Linux:**
```bash
# Test full installation with work profile
curl -L wsl.jfa.dev | bash -s -- --full-install --work-profile

# Test Nix-only mode
curl -L wsl.jfa.dev | bash -s -- --nix-only
```

**macOS:**
```bash
# Test installation
curl -L mac.jfa.dev | bash
```

## Important Implementation Details

### Nix Flake Outputs

When modifying flakes, understand the output structure:

**WSL/Linux outputs:**
- `homeConfigurations.jfalava-personal`
- `homeConfigurations.jfalava-work`
- `homeConfigurations.jfalava` (default)

**macOS outputs:**
- `darwinConfigurations.{macos,default,jfa-mac-mini}`
- `homeConfigurations.{macos,default}`
- `devShells.aarch64-darwin.default`

### Cloudflare Worker URL Structure

The worker uses a domain-routing pattern:
1. Domain validation middleware checks host against `ALLOWED_HOSTS`
2. Routing middleware delegates to platform-specific Hono apps
3. Each platform app handles its own routes (/, /packages/bun, /config/*, etc.)

### Package Profile Composition

Windows profiles use a composable system where the installation script parses URL paths like `dev+gaming+qol` and merges the corresponding .txt files. This is fundamentally different from Nix's module system.

### Dotfiles Management

- Windows: Fetched directly via Cloudflare Worker from GitHub
- WSL/Linux: Symlinked via Home Manager `home.file` attribute in base.nix
- macOS: Symlinked via Home Manager in home.nix

### Home Manager Repository Path

The variable `outfittingRepo` in `packages/x64-linux/base.nix` must match the actual repository location. Default: `~/.config/outfitting/repo`. If changing this, also update the `~/.config/outfitting/repo-path` file.

## Development Workflow

### Modifying Nix Configurations

1. Edit files in `packages/{x64-linux,aarch64-darwin}/`
2. Test build: `nix build .#homeConfigurations.<config>.activationPackage`
3. Apply locally: `home-manager switch --flake .#<config>`
4. Commit changes
5. Push to GitHub (users pull changes via `git pull && hm-sync`)

### Modifying Windows Packages

1. Edit relevant .txt files in `packages/x64-windows/`
2. Test by running installation script with specific profile
3. Commit and push (changes effective immediately via Cloudflare Worker)

### Modifying Cloudflare Worker

1. Edit TypeScript files in `installer/src/`
2. Test locally: `bun run dev`
3. Validate: `bun run check`
4. Deploy: `bun run deploy` (runs full CI pipeline)

### Modifying Installation Scripts

1. Edit `{windows,wsl,macos}-install-script.{ps1,sh}` in repository root
2. Test via curl/irm from local branch or fork
3. Commit and push to main (Cloudflare Worker serves from main branch)
