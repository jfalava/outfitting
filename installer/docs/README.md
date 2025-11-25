# Installer Documentation

This directory contains documentation for the Outfitting installer Cloudflare Worker.

## Available Documentation

- **[config-api.md](config-api.md)** - Complete API documentation for config file endpoints
  - Individual file endpoints (`/config/:file`)
  - Batch update script (`/config/all`)
  - Usage examples and troubleshooting

## Quick Reference

### Update Individual Configs

```bash
# WSL/Linux
curl -fsSL wsl.jfa.dev/config/zshrc -o ~/.zshrc
curl -fsSL wsl.jfa.dev/config/ripgreprc -o ~/.ripgreprc
curl -fsSL wsl.jfa.dev/config/gitconfig -o ~/.gitconfig

# Windows
Invoke-WebRequest -Uri "https://win.jfa.dev/config/powershell" -OutFile $PROFILE
```

### Update All Configs

```bash
# WSL/Linux
curl -fsSL wsl.jfa.dev/config/all | bash

# Windows
irm win.jfa.dev/config/all | iex
```

### Full Installation

```bash
# WSL/Linux
curl -L wsl.jfa.dev | bash

# Windows (elevated)
irm win.jfa.dev | iex

# Windows post-install (non-elevated)
irm win.jfa.dev/post-install | iex
```

## Development

See the main [README.md](../../README.md) for project overview and [config-api.md](config-api.md) for development workflow.
