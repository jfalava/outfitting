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

**Configuration Approach (Symlinks):**
- Install scripts **symlink** configuration directories (not copy)
- WSL: `~/.config/home-manager` → `~/.config/outfitting/repo/packages/x64-linux`
- macOS: `~/.config/home-manager` → `~/.config/outfitting/repo/packages/aarch64-darwin`
- macOS: `~/.nixpkgs/darwin-configuration.nix` → `~/.config/outfitting/repo/packages/aarch64-darwin/darwin.nix`
- **Benefit**: Changes to repo files immediately apply via `home-manager switch` or `darwin-rebuild switch`
- **Benefit**: Preserves relative paths to `../../dotfiles/` in home.nix

**Key Files:**
- **home.nix** - Base configuration with packages, dotfile management, and program configurations
- **work.nix** (WSL only) - Extends home.nix with work-specific packages (AWS, Kubernetes, Terraform, Azure tools)
- **darwin.nix** (macOS only) - macOS system configuration using nix-darwin
- **dotfiles/.zshrc-base** - Universal zsh configuration (shared across WSL/macOS)
- **dotfiles/.zshrc-wsl** - WSL-specific zsh configuration (sources .zshrc-base)
- **dotfiles/.zshrc-macos** - macOS-specific zsh configuration (sources .zshrc-base)

**Managed by Nix/Home Manager/nix-darwin:**
- All development tools and CLI utilities
- Dotfiles (.zshrc via Home Manager's home.file symlinks)
- Git configuration with SSH signing
- Tool-specific configs (bat, eza, ripgrep, fzf, etc.) via programs.* modules
- Environment variables and PATH additions
- macOS system settings (via nix-darwin)
- NIX_PATH export (via .zshrc-base)

**NOT Managed by Nix:**
- APT packages and system libraries (WSL/Linux)
- Docker (via Docker's APT repository)
- Runtime installers (Bun, uv - installed separately but PATH managed by dotfiles)
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

# Update packages via flakes and apply configuration (maintains current profile)
hm-update

# Sync configuration from local repository and apply
hm-sync

# Advanced: Build specific configurations directly
home-manager switch --flake .#jfalava-personal  # Personal
home-manager switch --flake .#jfalava-work      # Work
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

**WSL/Linux:**
1. Edit `packages/x64-linux/home.nix` (personal packages)
2. Or edit `packages/x64-linux/work.nix` (work-specific packages)
3. Add package to `home.packages` array
4. Test locally: `hm-sync` (applies changes via symlink)
5. Commit and push to GitHub
6. On other machines: `git pull` then `hm-sync`

**macOS:**
1. Edit `packages/aarch64-darwin/home.nix`
2. Add package to appropriate profile's packages array
3. Test locally: `hm-sync` (applies changes via symlink)
4. Commit and push to GitHub
5. On other machines: `git pull` then `hm-sync`

### Updating Dotfiles and Program Configurations

**Shell Configuration (.zshrc, .zshrc-base):**
1. Edit files in `dotfiles/` directory:
   - `dotfiles/.zshrc-base` - Universal configuration (shared)
   - `dotfiles/.zshrc-wsl` - WSL-specific configuration
   - `dotfiles/.zshrc-macos` - macOS-specific configuration
2. Commit and push to GitHub
3. Apply locally: `hm-sync` (symlinks mean changes apply immediately)
4. On other machines: `git pull` then `hm-sync`

**Program Configurations (bat, ripgrep, etc.):**
1. Edit platform-specific configuration files:
   - WSL: `packages/x64-linux/base.nix` (personal) or `work.nix` (work extensions)
   - macOS: `packages/aarch64-darwin/home.nix` (personal) or `work.nix` (work extensions)
2. Modify `programs.*` sections (e.g., `programs.ripgrep.arguments`)
3. Test locally: `hm-sync`
4. Commit and push to GitHub
5. On other machines: `git pull` then `hm-sync`

**Windows PowerShell Profile:**
- Users run `irm win.jfa.dev/config/pwsh-profile | iex` to pull latest

### Modifying Installation Scripts

1. Edit installation scripts:
   - `windows-install-script.ps1` - Main Windows installation
   - `windows-post-install-script.ps1` - Windows post-install
   - `wsl-install-script.sh` - WSL/Linux installation
   - `macos-install-script.sh` - macOS installation
2. Commit and push to GitHub
3. Changes are immediately available via short URLs (scripts are fetched from GitHub)

**Important: Installation Script Patterns**
- **DO NOT** manually append to `~/.zshrc` - Home Manager creates it
- **DO** use symlinks for config directories (preserves relative paths)
- **DO** source runtime PATHs in current session after installing (for immediate use)
- **DO** let dotfiles manage NIX_PATH (via `.zshrc-base`)
- **DO** back up existing directories before symlinking

## Repository Configuration System

Both WSL and macOS installations include a configurable repository location system that enables local development and customization via symlinks.

### Configuration Process

During installation, the default repository location is set to:
- **Default**: `~/.config/outfitting/repo` (cloned automatically if doesn't exist)

### Configuration Storage

Repository location is stored in: `~/.config/outfitting/repo-path`

### Symlink Structure

**WSL/Linux:**
```bash
~/.config/home-manager → ~/.config/outfitting/repo/packages/x64-linux
~/.zshrc → ~/.config/outfitting/repo/packages/x64-linux/../../dotfiles/.zshrc-wsl (via Home Manager)
~/.zshrc-base → ~/.config/outfitting/repo/dotfiles/.zshrc-base (via Home Manager)
```

**macOS:**
```bash
~/.config/home-manager → ~/.config/outfitting/repo/packages/aarch64-darwin
~/.nixpkgs/darwin-configuration.nix → ~/.config/outfitting/repo/packages/aarch64-darwin/darwin.nix
~/.zshrc → ~/.config/outfitting/repo/packages/aarch64-darwin/../../dotfiles/.zshrc-macos (via Home Manager)
~/.zshrc-base → ~/.config/outfitting/repo/dotfiles/.zshrc-base (via Home Manager)
```

### Setup Commands

```bash
# Change repository location to a custom path
set_outfitting_repo ~/path/to/outfitting
```

### Benefits

- **Immediate Changes**: Edit repo files → run `hm-sync` → changes apply (no manual copying)
- **Relative Paths Work**: Symlinks preserve directory structure for `../../dotfiles/` references
- **Git Workflow**: Edit → commit → push → pull on other machines → `hm-sync`
- **Profile Switching**: `hm-personal`/`hm-work` use flake composition to switch configurations
- **Offline Work**: Local edits work without GitHub dependency

## Important Configuration Details

### Git Signing

- Uses SSH signing (not GPG)
- Key location: `~/.ssh/jfalava-gitSign-elliptic`
- Both `commit.gpgsign` and `tag.gpgsign` enabled
- Work environment overrides email to `jorgefernando.alava@seidor.com`

### Home Manager Configuration Structure

**Flake Composition System:**
- **WSL/Linux**: Uses `base.nix` (personal) + `work.nix` (work extensions)
- **macOS**: Uses `home.nix` (personal) + `work.nix` (work extensions) 
- **Personal profile**: `home-manager switch --flake .#jfalava-personal`
- **Work profile**: `home-manager switch --flake .#jfalava-work` (adds AWS, K8s tools)
- **Switch profiles**: `hm-personal` or `hm-work` commands
- **Check current**: `hm-profile`

**How Profile Switching Works:**
- Uses Nix flake composition to extend base configuration
- Work profile automatically inherits all personal settings
- No file copying - pure flake-based module system
- Profiles are separate flake outputs that can be built independently

**Default Workflow:**
- Use `hm-sync` to apply repo changes via symlinks
- Edit files in repo → commit → `hm-sync` → changes apply
- Clean, immediate, no file copying

### Shell Configuration (NIX_PATH Management)

**Important: NIX_PATH is NOT appended by install scripts**
- NIX_PATH is managed declaratively via `dotfiles/.zshrc-base`
- Line 569: `export NIX_PATH="$HOME/.nix-defexpr/channels${NIX_PATH:+:$NIX_PATH}"`
- This ensures NIX_PATH is available in all zsh sessions
- Install scripts DO NOT modify `.zshrc` (avoids chicken-and-egg problems)

**Shell Configuration Flow:**
1. Install scripts create symlinks (WSL/macOS)
2. Home Manager/nix-darwin runs and creates `~/.zshrc` via `home.file`
3. `~/.zshrc` is symlinked to `.zshrc-wsl` or `.zshrc-macos`
4. Those files source `~/.zshrc-base` which exports NIX_PATH
5. User opens new zsh → everything loaded correctly

**Runtime PATH Management:**
- Bun, uv, deno PATHs are in `.zshrc-wsl` and `.zshrc-macos`
- Install scripts source runtimes for current session (for bun global packages)
- Future sessions get PATHs from dotfiles automatically

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

# Install nix-darwin for system management (personal profile by default)
nix run nix-darwin -- switch --flake github:jfalava/outfitting?dir=packages/aarch64-darwin#jfalava-personal

# Or install with work profile
nix run nix-darwin -- switch --flake github:jfalava/outfitting?dir=packages/aarch64-darwin#jfalava-work
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
