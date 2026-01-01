# Outfitting

Automated setup scripts, dotfiles, and Cloudflare Workers for provisioning personal development environments across Windows, WSL/Linux, and macOS.

> [!WARNING]
> Are you installing an LTSC version of Windows? Those are missing the Microsoft Store app, install it along WinGet with [this tool](https://github.com/kkkgo/LTSC-Add-MicrosoftStore).

## How to run the automatic installation scripts

### Windows

> [!IMPORTANT]
>
> - You may need to install or update [WinGet](https://learn.microsoft.com/en-us/windows/package-manager/winget/#install-winget).
> - A regular Windows machine will have it installed, but it might be outdated. Open this [link to the Microsoft Store](https://apps.microsoft.com/detail/9NBLGGH4NNS1) and update it if needed.
> - You may also need to execute `Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process` if you encounter elevation issues.
> - **All package installations must be explicitly specified - there is no default installation.**

#### View Available Packages

```powershell
irm win.jfa.dev | iex  # Display help message with all available profiles
```

#### WinGet Package Installation

All commands require elevated PowerShell:

```powershell
# Single profile
irm win.jfa.dev/base | iex
irm win.jfa.dev/dev | iex

# Multiple profiles combined
irm win.jfa.dev/base+dev+gaming | iex
irm win.jfa.dev/dev+gaming+qol | iex
```

**Available WinGet profiles:**
- `base` - Core packages, runtimes, and utilities
- `dev` - Development tools and environments
- `gaming` - Gaming platforms and tools
- `work` - Work-related applications
- `qol` - Quality of life improvements
- `network` - Network tools and utilities

#### Microsoft Store Package Installation

> [!NOTE]
> Microsoft Store packages require the `/msstore/` prefix in the URL.

Install apps from the Microsoft Store:

```powershell
# Single profile
irm win.jfa.dev/msstore/msstore-base | iex

# Multiple profiles combined (note the /msstore/ prefix)
irm win.jfa.dev/msstore/msstore-base+msstore-gaming | iex
irm win.jfa.dev/msstore/msstore-base+msstore-gaming+msstore-qol | iex
```

**Available Microsoft Store profiles:**
- `msstore-base` - Core Microsoft Store apps
- `msstore-dev` - Development-related Store apps
- `msstore-gaming` - Gaming-related Store apps
- `msstore-work` - Work-related Store apps
- `msstore-qol` - Quality of life Store apps

**Correct format:**
```powershell
irm win.jfa.dev/msstore/<profile>+<profile> | iex
```

#### Bun Global Packages Installation

Install Bun global packages (requires Bun to be installed first via `dev` profile):

```powershell
irm win.jfa.dev/bun | iex
```

### WSL/Linux

For Ubuntu-based WSL distributions:

#### Installation Modes

**Default mode** (personal profile):
```bash
curl -L wsl.jfa.dev | bash
```
- Updates Nix channels and packages
- Applies Home Manager configuration (personal profile)
- Skips APT package installation

**Full installation**:
```bash
curl -L wsl.jfa.dev | bash -s -- --full-install
```

**Other modes**:
```bash
curl -L wsl.jfa.dev | bash -s -- --update-only   # APT + system packages only
curl -L wsl.jfa.dev | bash -s -- --nix-only      # Nix installation only
```

#### Profile Selection

Choose between personal or work profiles at installation time:

```bash
# Personal profile (default)
curl -L wsl.jfa.dev | bash

# Work profile
curl -L wsl.jfa.dev | bash -s -- --work-profile

# Explicit personal profile selection
curl -L wsl.jfa.dev | bash -s -- --personal-profile

# Combine with installation modes
curl -L wsl.jfa.dev | bash -s -- --full-install --work-profile
```

#### Profile Commands

After installation, you can switch profiles using these commands:

```bash
# Check current active profile
hm-profile

# Switch to personal profile
hm-personal

# Switch to work profile
hm-work

# Apply configuration changes
hm-sync

# Update packages and apply configuration
hm-update
```

### macOS

```bash
curl -L mac.jfa.dev | bash
```

## Repository Configuration

### Automatic Setup

During installation, the repository is automatically cloned to `~/.config/outfitting/repo` and **symlinked** to configuration directories:

**WSL/Linux:**
```bash
~/.config/home-manager → ~/.config/outfitting/repo/packages/x64-linux
```

**macOS:**
```bash
~/.config/home-manager → ~/.config/outfitting/repo/packages/aarch64-darwin
~/.nixpkgs/darwin-configuration.nix → ~/.config/outfitting/repo/packages/aarch64-darwin/darwin.nix
```

## Updating After Installation

### WSL/Linux

#### Quick Update

```bash
curl -L wsl.jfa.dev | bash
```

#### Update Local Configuration

After editing files in `~/.config/outfitting/repo`:

```bash
git pull                    # Pull latest changes from GitHub
hm-sync                     # Apply configuration
```

#### Update Packages

```bash
hm-update                   # Update Nix channels + apply configuration
update-all                  # Update APT + Nix + Bun packages + cleanup
```

#### Other Update Modes

```bash
curl -L wsl.jfa.dev | bash -s -- --update-only   # APT packages only
curl -L wsl.jfa.dev | bash -s -- --full-install  # Full reinstall
```

### macOS

#### Update Local Configuration

After editing files in `~/.config/outfitting/repo`:

```bash
git pull                    # Pull latest changes from GitHub
hm-sync                     # Apply configuration via symlinks
```

#### Update Packages

```bash
hm-update                   # Update Nix channels + apply configuration
update-all                  # Update Homebrew + Nix + Bun packages + cleanup
```

#### Nix-darwin profile management

```bash
# Build and apply changes
or switch                   # Apply current configuration
or build                    # Test build without applying
or test                     # Test build and show results

# Update with new packages
or upgrade                  # Update packages and apply

# Check what would change
or dry                      # Dry-run to preview changes

# List and rollback generations
drl                         # List available generations
drr                         # Rollback to previous generation

# Traditional nix-darwin commands (from repo directory)
darwin-rebuild switch --flake ".#macos"  # Apply configuration
darwin-rebuild build --flake ".#macos"   # Test build only
```

#### Nix package testing

Test packages before adding them to your configuration:

```bash
nix-test bat                # Test if 'bat' package works
nix-try ripgrep             # Search for ripgrep and suggest testing
```

### Windows

#### Update PowerShell Profile

```powershell
irm win.jfa.dev/config/pwsh-profile | iex
```

#### Install/Update Bun Global Packages

```powershell
irm win.jfa.dev/bun | iex
```

### Install/Update Bun Global Packages (WSL/macOS)

**WSL/Linux:**
```bash
curl -fsSL wsl.jfa.dev/packages/bun | xargs -I {} bun install -g {}
```

**macOS:**
```bash
curl -fsSL mac.jfa.dev/packages/bun | xargs -I {} bun install -g {}
```
