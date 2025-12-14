# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This repository contains scripts, dotfiles, and Cloudflare Workers for automatic outfitting of personal machines (Windows and WSL/Linux). It provides a unified installation system through short URLs (win.jfa.dev, wsl.jfa.dev) that serve installation scripts and configuration files.

## Architecture

The repository is structured into three main components:

### 1. Installation Scripts (Root)

- **windows-install-script.ps1** - Main Windows installation (requires elevated PowerShell)
- **windows-post-install-script.ps1** - Post-install tasks (requires non-elevated PowerShell)
- **wsl-install-script.sh** - WSL/Linux installation (apt-based distributions only, tested on Ubuntu 24.04)

These scripts are fetched and executed via short URLs served by the Cloudflare Worker.

### 2. Cloudflare Worker (installer/)

A Hono-based Cloudflare Worker that serves installation scripts and config files through domain-specific routes:

**Key Architecture Points:**
- Uses Hono framework for routing
- Domain-aware routing (wsl.jfa.dev vs win.jfa.dev)
- Proxies content from GitHub raw URLs
- Returns 418 (I'm a teapot) for unauthorized domains
- All scripts served with no-cache headers for freshness

**Main Routes:**
- `GET /` - Main installation script (platform-specific based on domain)
- `GET /post-install` - Windows post-install script (Windows only)
- `GET /config/:file` - Individual config files (powershell for Windows)
- `GET /config/all` - Batch update script with automatic backups

**Source:**
- `installer/src/index.ts` - Main worker application
- Fetches from: `https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main`

### 3. Nix/Home Manager Configuration (packages/x64-linux/)

Declarative environment management for WSL/Linux using Nix flakes and Home Manager.

**Key Files:**
- **flake.nix** - Defines two configurations: `jfalava` (personal) and `jfalava-work` (work environment)
- **home.nix** - Base configuration with 50+ packages, dotfile management, and program configurations
- **work.nix** - Extends home.nix with work-specific packages (AWS, Kubernetes, Terraform, Azure tools)

**Managed by Home Manager:**
- All development tools and CLI utilities
- Dotfiles (.zshrc, .ripgreprc) via symlinks
- Git configuration with SSH signing
- Tool-specific configs (bat, eza, ripgrep, fzf, etc.)
- Environment variables and PATH additions

**NOT Managed by Nix:**
- APT packages and system libraries
- Docker (via Docker's APT repository)
- Runtime installers (Bun, uv)
- Some LLM CLIs (installed via Bun globally)

## Common Development Commands

### Cloudflare Worker (installer/)

```bash
cd installer

# Development server
bun run dev

# Type generation for Cloudflare Workers types
bun run cf-typegen

# Type checking (using tsgo - TypeScript with Go-like speed)
bun run typecheck

# Linting (oxlint with type-aware checking)
bun run lint

# Formatting (oxfmt)
bun run format

# Deploy to Cloudflare (runs all checks first)
bun run deploy
```

**Deployment Process:**
The deploy script automatically runs: cf-typegen → typecheck → lint → format → wrangler deploy

### Home Manager (packages/x64-linux/)

```bash
# Apply configuration from GitHub (recommended for production)
home-manager switch --flake "github:jfalava/outfitting?dir=packages/x64-linux#jfalava"

# Apply from local clone (for testing)
cd packages/x64-linux
home-manager switch --flake .#jfalava

# Work environment configuration
home-manager switch --flake "github:jfalava/outfitting?dir=packages/x64-linux#jfalava-work"

# Update flake inputs
nix flake update

# Search for packages
nix search nixpkgs <package-name>

# List generations (for rollback)
home-manager generations
```

**Sync Helper Command:**
The installation script creates `hm-sync` alias that runs the GitHub flake switch command.

### Installation Script Updates

After modifying dotfiles or installation scripts, they're automatically served by the Cloudflare Worker from GitHub's main branch. No manual deployment needed for scripts, but the Worker itself needs deployment if routes change.

## Development Workflow

### Modifying the Cloudflare Worker

1. Make changes to `installer/src/index.ts`
2. Test with `bun run dev`
3. Run `bun run typecheck` and `bun run lint`
4. Deploy with `bun run deploy`

### Adding Packages to Home Manager

1. Edit `packages/x64-linux/home.nix` or `work.nix`
2. Add package to `home.packages` array
3. Test locally: `home-manager switch --flake .#jfalava`
4. Commit and push to GitHub
5. Apply from GitHub: `home-manager switch --flake "github:jfalava/outfitting?dir=packages/x64-linux#jfalava"`

### Updating Dotfiles

1. Edit files in `dotfiles/` directory
2. Commit and push to GitHub
3. For Nix-managed dotfiles (.zshrc-wsl, .ripgreprc):
   - Run `hm-sync` or `home-manager switch --flake github:...`
4. For Windows PowerShell profile:
   - Users run `irm win.jfa.dev/config/all | iex` to pull latest

### Modifying Installation Scripts

1. Edit `windows-install-script.ps1`, `windows-post-install-script.ps1`, or `wsl-install-script.sh`
2. Commit and push to GitHub
3. Changes are immediately available via short URLs (scripts are fetched from GitHub)

## Important Configuration Details

### Git Signing

- Uses SSH signing (not GPG)
- Key location: `~/.ssh/jfalava-gitSign-elliptic`
- Both `commit.gpgsign` and `tag.gpgsign` enabled
- Work environment overrides email to `jorgefernando.alava@seidor.com`

### Home Manager Flake Structure

Two configurations in `flake.nix`:
- `jfalava` - Personal environment (uses `./home.nix`)
- `jfalava-work` - Work environment (imports `./home.nix` + `./work.nix` overrides)

### WSL Update Modes

The WSL install script supports `--update-only` flag:
```bash
curl -L wsl.jfa.dev | bash -s -- --update-only
```
This updates repositories and APT packages only, skipping Nix/Home Manager/runtimes.

## Domain Routing Logic

The Cloudflare Worker uses strict domain checking:
- **wsl.jfa.dev** - Serves Linux/WSL scripts and configs
- **win.jfa.dev** - Serves Windows scripts and configs
- Other domains receive 418 status

This prevents accidental cross-platform script execution.

## Installation Entry Points

**Windows:**
```powershell
irm win.jfa.dev | iex  # Elevated PowerShell
irm win.jfa.dev/post-install | iex  # Non-elevated PowerShell
```

**WSL/Linux:**
```bash
curl -L wsl.jfa.dev | bash
```

**Home Manager (manual):**
```bash
nix run home-manager/master -- switch --flake "github:jfalava/outfitting?dir=packages/x64-linux#jfalava"
```

## Technology Stack

- **Cloudflare Workers** - Script delivery infrastructure
- **Hono** - Web framework for Workers
- **Nix** - Package management for Linux/WSL
- **Home Manager** - Declarative dotfile and environment management
- **TypeScript** - Worker implementation language
- **Bun** - Package manager and runtime for worker development
- **oxlint/oxfmt** - Fast linting and formatting
- **tsgo** - Fast TypeScript type checking
- **Wrangler** - Cloudflare Workers deployment CLI
