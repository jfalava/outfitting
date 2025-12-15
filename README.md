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
curl -L wsl.jfa.dev | bash
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

**Repository Configuration:**
During installation, you'll be prompted to configure a local repository location for the best nix-darwin experience. This enables:

- Local development and customization  
- Commands like `hm-sync`, `hm-switch`, and `hm-update`
- Automatic commit/push prompts when making changes

**Configuration options:**
- **Default**: `~/workspace/outfitting` (recommended)
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

#### Update Repositories and APT Packages

Install newly added `apt` packages to the [apt list](packages/x64-linux/apt.txt):

```bash
remote-update
# OR
curl -L https://wsl.jfa.dev | bash -s -- --update-only
```

This will:
- Add any new repositories
- Reinstall APT packages from the package list
- **Skip Nix, Home Manager, runtimes, and Bun global packages**

#### Sync Home Manager Configuration

Update your Home Manager configuration with latest changes from your local clone (prompts to commit and push if changes exist):

```bash
hm-sync
# OR
home-manager switch --flake ~/path/to/your/outfitting/clone/packages/x64-linux#jfalava
```

**Note**: The WSL installer will prompt you to configure a local repository location during installation. You can skip this and use remote configuration, but local commands like `hm-sync` require a local clone. To set up later, run `setup-outfitting-repo`.

### Windows

```powershell
# Update PowerShell profile
Invoke-WebRequest -Uri "https://win.jfa.dev/config/powershell" -OutFile $PROFILE

# Or update PowerShell profile with automatic backup
irm win.jfa.dev/config/pwsh-profile | iex
```

For detailed API documentation and more examples, see the [API config documentation](installer/docs/config-api.md).

## TODO

- [ ] Fonts
- [ ] System preferences
  - [x] Windows Registry
  - [ ] Windows Settings (like mouse acceleration)
- [x] Shell preferences
