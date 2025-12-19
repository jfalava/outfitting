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

**Default mode**:
```bash
curl -L wsl.jfa.dev | bash
```
- Updates Nix channels and packages
- Applies Home Manager configuration
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

### macOS

```bash
curl -L mac.jfa.dev | bash
```

#### What Gets Installed

#### Post-Installation

After installation, open a new terminal. Bun global packages will be installed automatically during setup. If they're skipped, install them manually:
```bash
curl -fsSL mac.jfa.dev/packages/bun | xargs -I {} bun install -g {}
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

### Reconfigure Repository Location

```bash
setup-outfitting-repo  # Interactive setup
```

### Profile Switching

Profile switching creates **copies** (not symlinks) to safely modify configuration without affecting the repository:

```bash
hm-personal  # Switch to personal profile (AI tools, personal git config)
hm-work      # Switch to work profile (AWS, K8s, Terraform, work git config)
hm-profile   # Check current active profile
```

**Note**: After switching profiles, use `hm-sync` to return to symlink mode for instant repo changes.

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
hm-sync                     # Apply configuration (symlinks mean instant changes)
```

#### Update Packages

```bash
hm-update                   # Update Nix channels + apply configuration
update-all                  # Update APT + Nix + Bun packages + cleanup
```

#### Other Update Modes

```bash
curl -L wsl.jfa.dev | bash -s -- --update-only   # APT packages only
curl -L wsl.jfa.dev | bash -s -- --full-install  # Full reinstall (use sparingly)
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

#### Reinstall from Script

```bash
curl -L mac.jfa.dev | bash  # Full reinstall (use sparingly)
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

```bash
darwin-rebuild switch  # Apply nix-darwin configuration
```

### Development

```bash
setup-outfitting-repo  # Reconfigure repository location
get_outfitting_repo    # Show current repository path
```
