# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This repository contains scripts, dotfiles, and Cloudflare Workers for automatic outfitting of personal machines (Windows, WSL/Linux, and macOS). It provides a unified installation system through short URLs (win.jfa.dev, wsl.jfa.dev, mac.jfa.dev) that serve installation scripts and configuration files.

## Architecture

The repository is structured into three main components:

### 1. Installation Scripts (Root)

- **windows-install-script.ps1** - Main Windows installation (requires elevated PowerShell)
- **windows-post-install-script.ps1** - Post-install tasks (requires non-elevated PowerShell)
- **wsl-install-script.sh** - WSL/Linux installation (apt-based distributions only, tested on Ubuntu 24.04)
- **macos-install-script.sh** - macOS Nix installation (universal binary, supports Apple Silicon and Intel)

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
- `GET /config/pwsh-profile` - PowerShell profile update script with automatic backup (Windows only)

**Source:**
- `installer/src/index.ts` - Main worker application
- Fetches from: `https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main`

### 3. Nix Configuration (packages/)

Declarative environment management using Nix channels with Home Manager/nix-darwin for different platforms.

**Package Management Approach:**
- Uses Nix **channels** (not flakes) for simpler, more robust management
- Packages float with `nixpkgs-unstable` channel for latest updates
- No flake.lock management overhead
- Simple update process: `nix-channel --update && home-manager switch`

**Platform-Specific Configurations:**
- **packages/x64-linux/** - WSL/Linux using Home Manager with channels
- **packages/aarch64-darwin/** - macOS using nix-darwin with channels

**Key Files:**
- **flake.nix** - Defines configurations: `jfalava` (personal) and `jfalava-work` (work environment)
- **home.nix** - Base configuration with packages, dotfile management, and program configurations
- **work.nix** - Extends home.nix with work-specific packages (AWS, Kubernetes, Terraform, Azure tools)
- **darwin.nix** - macOS system configuration using nix-darwin

**Managed by Nix/Home Manager/nix-darwin:**
- All development tools and CLI utilities
- Dotfiles (.zshrc via symlink)
- Git configuration with SSH signing
- Tool-specific configs (bat, eza, ripgrep, fzf, etc.) via programs.* modules
- Environment variables and PATH additions
- macOS system settings (via nix-darwin)

**NOT Managed by Nix:**
- APT packages and system libraries (WSL/Linux)
- Docker (via Docker's APT repository)
- Runtime installers (Bun, uv)
- Some LLM CLIs (installed via Bun globally)
- Homebrew packages (macOS)

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

### Home Manager (WSL) and nix-darwin (macOS)

**Quick Update Commands:**

```bash
# Switch to personal profile (AI tools, personal git config)
hm-personal

# Switch to work profile (AWS, Kubernetes, Terraform, work git config)
hm-work

# Check current active profile
hm-profile

# Update packages via channels and apply configuration
hm-update

# Sync configuration from local repository and apply
hm-sync
```

**System-Wide Updates:**

```bash
# Update everything (system packages + Nix packages)
update-all
```

**Version Management & Advanced:**

```bash
# Check for newer Home Manager releases
hm-version-manager.sh check

# Update to latest Home Manager stable release
hm-version-manager.sh update

# Make NIX_PATH persistent across shell sessions
hm-version-manager.sh setup-nix-path

# List generations (for rollback)
home-manager generations

# Search for packages
nix search nixpkgs <package-name>
```

**Configuration:**

These commands use a configurable local repository (stored in `~/.config/outfitting/repo-path`). The installation scripts set this up automatically, but you can reconfigure it with:
```bash
setup-outfitting-repo
```

### Installation Script Updates

After modifying dotfiles or installation scripts, they're automatically served by the Cloudflare Worker from GitHub's main branch. No manual deployment needed for scripts, but the Worker itself needs deployment if routes change.

## Development Workflow

### Modifying the Cloudflare Worker

1. Make changes to `installer/src/index.ts`
2. Test with `bun run dev`
3. Run `bun run typecheck` and `bun run lint`
4. Deploy with `bun run deploy`

### Adding Packages to Home Manager

1. Edit `packages/x64-linux/home.nix` or `packages/x64-linux/work.nix`
2. Add package to `home.packages` array
3. Test locally: `hm-sync` (requires local repository configured)
4. Commit and push to GitHub
5. On other machines: `hm-sync` to apply the changes

### Updating Dotfiles and Program Configurations

1. Configure local repository with `setup-outfitting-repo` (if not done during installation)
2. Edit configuration in platform-specific packages:
   - WSL: `packages/x64-linux/home.nix` (ripgrep, bat, eza, fzf configs, etc.)
   - macOS: `packages/aarch64-darwin/home.nix` (same configs)
3. Commit and push to GitHub
4. Apply changes locally: `hm-sync` (uses configured local repository)
5. On other machines: Pull updates and run `hm-sync` to apply
6. For Windows PowerShell profile:
   - Users run `irm win.jfa.dev/config/pwsh-profile | iex` to pull latest

### Modifying Installation Scripts

1. Edit `windows-install-script.ps1`, `windows-post-install-script.ps1`, or `wsl-install-script.sh`
2. Commit and push to GitHub
3. Changes are immediately available via short URLs (scripts are fetched from GitHub)

## Repository Configuration System

Both WSL and macOS installations now include a configurable repository location system that enables local development and customization.

### Configuration Process

During installation, users are prompted to choose a repository location:
- **Default**: `~/Workspace/outfitting`
- **Custom**: Any user-specified location
- **Existing**: Point to an existing clone
- **Skip**: Use remote configuration only

### Configuration Storage

Repository location is stored in: `~/.config/outfitting/repo-path`

### Setup Commands

```bash
# Interactive setup (run if skipped during installation)
setup-outfitting-repo

# Manual configuration
set_outfitting_repo ~/path/to/outfitting
```

### Benefits

- **Local Development**: Edit configurations locally before committing
- **Git Workflow**: Automatic commit/push prompts when making changes
- **Cross-Machine Sync**: Push changes and pull on other machines
- **Offline Work**: No dependency on GitHub availability for local changes

## Important Configuration Details

### Git Signing

- Uses SSH signing (not GPG)
- Key location: `~/.ssh/jfalava-gitSign-elliptic`
- Both `commit.gpgsign` and `tag.gpgsign` enabled
- Work environment overrides email to `jorgefernando.alava@seidor.com`

### Home Manager Configuration Structure

Two configurations defined in `flake.nix`:
- `jfalava` - Personal environment (uses `./home.nix`)
- `jfalava-work` - Work environment (imports `./home.nix` + `./work.nix` overrides)

These configurations are installed via Nix channels (not flakes) for simpler, more robust package management. Use `hm-personal` and `hm-work` to switch between profiles.

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
- **mac.jfa.dev** - Serves macOS scripts and configs
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

**macOS:**
```bash
# Install Nix
curl -L mac.jfa.dev | bash

# Install nix-darwin for system management
nix run nix-darwin -- switch --flake github:jfalava/outfitting?dir=packages/aarch64-darwin
```

## Technology Stack

- **Cloudflare Workers** - Script delivery infrastructure
- **Hono** - Web framework for Workers
- **Nix** - Package management for Linux/WSL and macOS
- **Home Manager** - Declarative dotfile and environment management (WSL/Linux)
- **nix-darwin** - macOS system configuration management
- **TypeScript** - Worker implementation language
- **Bun** - Package manager and runtime for worker development
- **oxlint/oxfmt** - Fast linting and formatting
- **tsgo** - Fast TypeScript type checking
- **Wrangler** - Cloudflare Workers deployment CLI
