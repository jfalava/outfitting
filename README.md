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

```powershell
# Base profile (default)
irm win.jfa.dev | iex

# Development profile
irm win.jfa.dev/dev | iex

# Gaming profile
irm win.jfa.dev/gaming | iex

# Work profile
irm win.jfa.dev/work | iex

# Full profile - Everything (all categories combined)
irm win.jfa.dev/full | iex

# Custom combination - Mix and match categories
irm win.jfa.dev/base+dev+gaming | iex
```

**Available categories:**
- `base`
- `dev`
- `gaming`
- `creative`
- `work`
- `msstore-qol`
- `full`

### WSL

> [!IMPORTANT]
> This is designed **exclusively** for `apt`-based Linux distributions **and** only tested on Ubuntu and Ubuntu 24.04.

> [!NOTE]
> You need `cURL` to execute this command, you may install it by running `sudo apt install curl`.

```sh
curl -L wsl.jfa.dev | bash
```

## Updating After Installation

### WSL/Linux

#### Update Repositories and APT Packages

If you've added new repositories or APT packages to the installation script, update them without reinstalling existing tools:

```bash
remote-update
# OR
curl -L https://wsl.jfa.dev | bash -s -- --update-only
```

This will:
- Add any new repositories
- Reinstall APT packages from the package list
- Skip Nix, Home Manager, runtimes, and LLM CLIs

#### Sync Home Manager Configuration

Update your Home Manager configuration with latest changes from GitHub:

```bash
hm-sync
# OR
home-manager switch --flake github:jfalava/outfitting?dir=packages/x64-linux#jfalava
```

### Windows

```powershell
# Update PowerShell profile
Invoke-WebRequest -Uri "https://win.jfa.dev/config/powershell" -OutFile $PROFILE

# Or update all configs with automatic backup
irm win.jfa.dev/config/all | iex
```

For detailed API documentation, see [installer/docs/config-api.md](installer/docs/config-api.md).

## TODO

- [ ] Fonts
- [ ] System preferences
  - [x] Windows Registry
  - [ ] Windows Settings (like mouse acceleration)
- [x] Shell preferences
