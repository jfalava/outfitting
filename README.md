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

#### Installation Profiles

Choose a profile based on your machine's purpose (all commands require elevated PowerShell):

##### Base profile (default)

```powershell
irm win.jfa.dev | iex
```

##### Full profile (includes everything)

```powershell
irm win.jfa.dev/full | iex
```

#### Profiles with Optional Components

```powershell
irm win.jfa.dev/<profile>+<profile>+<component> | iex # any arbitrary combination
```

**Available base profiles:**
- `base` - System runtimes, core utilities, browsers
- `dev` - Development tools
- `gaming` - Game launchers and game-specific tools
- `work` - Enterprise tools
- `full` - All categories combined

**Optional components** (add to any profile with `+`):
- `qol` - Quality of life tools
- `network` - VPN clients and network security tools

**Individual categories** (for custom combinations):
- `base`, `dev`, `gaming`, `work`, `qol`, `network`
- `msstore-base`, `msstore-dev`, `msstore-gaming`, `msstore-work`, `msstore-qol`
- `pwsh-modules`

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

During installation, the repository is automatically cloned to `~/Workspace/outfitting` and **symlinked** to configuration directories:

**WSL/Linux:**
```bash
~/.config/home-manager → ~/Workspace/outfitting/packages/x64-linux
```

**macOS:**
```bash
~/.config/home-manager → ~/Workspace/outfitting/packages/aarch64-darwin
~/.nixpkgs/darwin-configuration.nix → ~/Workspace/outfitting/packages/aarch64-darwin/darwin.nix
```

## Updating After Installation

### WSL/Linux

#### Quick Update

```bash
curl -L wsl.jfa.dev | bash
```

#### Update Local Configuration

After editing files in `~/Workspace/outfitting`:

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

After editing files in `~/Workspace/outfitting`:

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
irm win.jfa.dev/config/pwsh-profile | iex  # Update PowerShell profile
```

### Install/Update Bun Global Packages

**WSL/Linux:**
```bash
curl -fsSL wsl.jfa.dev/packages/bun | xargs -I {} bun install -g {}
```

**macOS:**
```bash
curl -fsSL mac.jfa.dev/packages/bun | xargs -I {} bun install -g {}
```

### macOS Specific

#### Nix-darwin Management

Quick commands for managing your nix-darwin configuration:

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
