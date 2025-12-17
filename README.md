# Outfitting

Scripts, dotfiles and lambdas for the automatic outfitting of my personal machines and VMs.

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

### WSL

For Ubuntu-based WSL:

```sh
curl -L https://wsl.jfa.dev | bash         # Quick update
curl -L https://wsl.jfa.dev | bash -s -- --full-install  # Full install
```

#### Installation Modes

**Default**:
```bash
curl -L https://wsl.jfa.dev | bash
```
- Updates repositories and Nix packages
- Skips APT installations
- Applies Home Manager configuration

**Full installation** (for new setups):
```bash
curl -L https://wsl.jfa.dev | bash -s -- --full-install
```
- Complete installation including APT packages
- Use this for first-time installations

**Other modes**:
```bash
curl -L https://wsl.jfa.dev | bash -s -- --update-only   # APT packages only
curl -L https://wsl.jfa.dev | bash -s -- --nix-only      # Nix only
```

### macOS

Installs Nix + Home Manager via channels:

```sh
curl -L mac.jfa.dev | bash
```

## Repository Configuration

Auto-configured during install (default: `~/Workspace/outfitting`). Required for:
- Local commands: `hm-sync`, `hm-personal`, `hm-work`
- Profile switching and local development

Change location:
```bash
setup-outfitting-repo
```

## Updating After Installation

### WSL

#### Default Update

Quick update using channels:

```bash
curl -L https://wsl.jfa.dev | bash
```

Updates Nix packages via channels and applies Home Manager config.

#### Installation Modes

**Default mode** (update + nix-only):
```bash
curl -L https://wsl.jfa.dev | bash
```

**Full installation** (includes APT packages):
```bash
curl -L https://wsl.jfa.dev | bash -s -- --full-install
```

**Update APT packages only**:
```bash
curl -L https://wsl.jfa.dev | bash -s -- --update-only
```

**Nix-only installation**:
```bash
curl -L https://wsl.jfa.dev | bash -s -- --nix-only
```

#### Legacy Update Command

This will:
- Add any new repositories
- Reinstall APT packages from the package list
- **Skip Nix, Home Manager, runtimes, and Bun global packages**

#### Sync Home Manager Configuration

Apply latest config from your local repo:

```bash
hm-sync           # Copy config and apply
hm-personal       # Switch to personal profile
hm-work          # Switch to work profile
```

### Windows

```powershell
irm win.jfa.dev/config/pwsh-profile | iex  # Update PowerShell profile
```

### macOS

#### Sync Home Manager Configuration

Apply latest config from your local repo:

```bash
hm-sync           # Copy config and apply
hm-personal       # Switch to personal profile  
hm-work          # Switch to work profile
```
