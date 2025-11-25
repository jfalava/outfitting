# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Outfitting** is a system configuration and automation toolkit for automated setup of personal development machines and VMs. It supports Windows, WSL (Ubuntu-based Linux), and includes a Cloudflare Worker for script distribution.

## Architecture

- **Cloudflare Worker** (`cloudflare/`): TypeScript + Hono web service serving installation scripts via custom domains (wsl.jfa.dev, win.jfa.dev)
- **Package Management** (`packages/`): Platform-specific package lists (WinGet, Scoop, APT, Nix)
- **Dotfiles** (`dotfiles/`): Shell and application configurations
- **Installation Scripts**: Platform entry points for automated setup
- **Windows Registry** (`windows-registry/`): Windows system configurations

## Development Commands

### Cloudflare Worker Development

```bash
cd cloudflare
pnpm install              # Install dependencies
pnpm run cf-typegen      # Generate Cloudflare types
pnpm run dry-build       # Type check without output
pnpm run deploy          # Deploy to Cloudflare
```

### Package Management

```bash
# Sort and deduplicate all package lists
scripts/sort-packages.sh
```

### Installation Entry Points

```bash
# WSL/Linux installation
curl -L wsl.jfa.dev | bash

# Windows installation (requires elevated PowerShell)
irm win.jfa.dev | iex

# Windows post-install (requires non-elevated PowerShell)
irm win.jfa.dev/post-install | iex
```

## Package Management Strategy

- **Linux**: Nix flakes (`packages/x64-linux/flake.nix`) for declarative package management + APT (`packages/x64-linux/apt.txt`) for system packages
- **Windows**: WinGet (`packages/x64-windows/winget.txt`) for most applications + Scoop (`packages/x64-windows/scoop.txt`) for development tools + Microsoft Store (`packages/x64-windows/msstore-winget.txt`) for UWP apps

## Automated Workflows

- **Package Sorting**: GitHub Action automatically sorts package lists alphabetically and removes duplicates on commits
- **Cloudflare Deployment**: Automatic deployment on main branch changes to cloudflare directory
- **URL Verification**: Tests for install scripts before deployment

## Key Files

- `wsl-install-script.sh` / `windows-install-script.ps1` / `windows-post-install-script.ps1`: Main installation entry points
- `cloudflare/src/index.ts`: Hono web service for script distribution
- `packages/`: All package definition files organized by platform
- `dotfiles/`: Shell and application configuration files
- `scripts/sort-packages.sh`: Package list maintenance utility

## Installation Requirements

- **Windows**: WinGet must be installed/updated, may need `Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process`
- **WSL**: Only supports apt-based distributions (tested on Ubuntu 24.04), requires curl
- **LTSC Windows**: Missing Microsoft Store, use [this tool](https://github.com/kkkgo/LTSC-Add-MicrosoftStore) to install it
