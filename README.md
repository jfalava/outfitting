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

#### Base Profiles

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

> [!IMPORTANT]
> This is designed **exclusively** for `apt`-based Linux distributions **and** only tested on Ubuntu and Ubuntu 24.04.

```sh
curl -L https://wsl.jfa.dev | bash
```

> [!NOTE]
> The default installation now runs in **update + nix-only mode** (skips APT packages for faster, safer updates). Use `--full-install` for complete installation including APT packages.

#### Installation Modes

**Default** (recommended for existing setups):
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

> [!IMPORTANT]
> This is designed for macOS and installs Nix package manager using the Determinate Systems installer.

> [!NOTE]
> You need `cURL` to execute this command.

```sh
curl -L mac.jfa.dev | bash
```

After installation, you'll need to install nix-darwin for system management:
```sh
nix run nix-darwin -- switch --flake github:jfalava/outfitting?dir=packages/aarch64-darwin
```

## Repository Configuration - WSL and macOS

During installation, you'll be prompted to configure a local repository location for the best nix experience. This enables:

- Local development and customization  
- Commands like `hm-sync`, `hm-switch`, and `hm-update`
- Automatic commit/push prompts when making changes

**Configuration options:**
- **Default**: `~/workspace/outfitting`
- **Custom**: Any location you prefer
- **Existing**: Point to an existing clone
- **Skip**: Use remote configuration only (local commands won't work)

**To configure later or change location:**
```bash
setup-outfitting-repo
```

**Configuration is stored in**: `~/.config/outfitting/repo-path`

## Updating After Installation

### WSL

#### Default Update

Fast and safe update that skips APT packages:

```bash
curl -L https://wsl.jfa.dev | bash
```

This will:
- Update repositories and Nix packages
- Skip APT package installations (faster, safer)
- Apply Home Manager configuration changes

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
remote-update
# OR
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

Update your Home Manager configuration with latest changes from your local clone (remote flakes cannot be updated and the sync does not do anything):

```bash
hm-sync
# OR
home-manager switch --flake ~/path/to/your/outfitting/clone/packages/x64-linux#jfalava
```

### Windows

```powershell
irm win.jfa.dev/config/pwsh-profile | iex # Update PowerShell profile with automatic backup
```

### macOS

#### Sync Home Manager Configuration

Update your Home Manager configuration with latest changes from your local clone (remote flakes cannot be updated and the sync does not do anything):

```bash
hm-sync
# OR
darwin-rebuild switch --flake ~/path/to/outfitting/clone/packages/aarch64-darwin#jfalava
```

For detailed API documentation and more examples, see the [API config documentation](installer/docs/config-api.md).
