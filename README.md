# Outfitting

Outfitting is a cross-platform bootstrap system for personal development machines.

It combines:

- installer scripts served from Cloudflare Workers
- profile-based package sets
- Home Manager and nix-darwin configuration from this repo
- utility commands for ongoing updates (`hm-sync`, `hm-update`, `or switch`, etc.)

## Quick Start

> [!WARNING]
> Windows LTSC does not include Microsoft Store by default. Install Store + WinGet first with [LTSC-Add-MicrosoftStore](https://github.com/kkkgo/LTSC-Add-MicrosoftStore).

### Windows

```powershell
irm win.jfa.dev | iex
```

Install profiles explicitly (examples):

```powershell
irm win.jfa.dev/base | iex
irm win.jfa.dev/base+dev+qol | iex
irm win.jfa.dev/msstore/msstore-base+msstore-dev | iex
irm win.jfa.dev/bun | iex
irm win.jfa.dev/registry | iex
```

### WSL/Linux (Ubuntu-based)

```bash
curl -L wsl.jfa.dev | bash
```

Modes:

```bash
curl -L wsl.jfa.dev | bash -s -- --full-install
curl -L wsl.jfa.dev | bash -s -- --update-only
curl -L wsl.jfa.dev | bash -s -- --nix-only
```

Profiles:

```bash
curl -L wsl.jfa.dev | bash -s -- --work-profile
curl -L wsl.jfa.dev | bash -s -- --personal-profile
```

### macOS

```bash
curl -L mac.jfa.dev | bash
```

## What Gets Installed

Outfitting applies four layers:

1. Package layer
- Windows: WinGet and optional Microsoft Store profile bundles
- WSL/macOS: Nix and Home Manager package sets

2. Configuration layer
- dotfiles and shell profile config
- Home Manager or nix-darwin configuration

3. Wiring layer
- repo clone to `~/.config/outfitting/repo`
- symlinks into platform config locations

4. Maintenance layer
- helper commands to sync, switch, update, rollback

## Core Profile Model

### Windows WinGet profiles

- `base`, `dev`, `gaming`, `work`, `qol`, `network`

### Windows Microsoft Store profiles

- `msstore-base`, `msstore-dev`, `msstore-gaming`, `msstore-work`, `msstore-qol`

Use `+` composition for custom bundles.

## Post-Install Updates

### WSL/Linux

```bash
git pull
hm-sync
hm-update
update-all
```

### macOS

```bash
git pull
hm-sync
hm-update
update-all
or switch
or upgrade
```

### Windows

```powershell
irm win.jfa.dev/config/pwsh-profile | iex
irm win.jfa.dev/bun | iex
irm win.jfa.dev/registry | iex
```

## Repository Structure

- `installer/`: Cloudflare Worker that serves installer/config endpoints
- `documentation/`: Fumadocs + TanStack docs app
- `packages/`: package profiles per platform
- `dotfiles/`: shared shell/editor/profile configs
- `system/`: platform-level system tweaks

## Additional Docs

- Installer service details: [`installer/README.md`](installer/README.md)
- Documentation app details: [`documentation/README.md`](documentation/README.md)
