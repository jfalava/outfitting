# Outfitting

Scripts, dotfiles and lambdas for the automatic outfitting of my personal machines and VMs.

## Automatic Package and Profile Installation

Single command package installation.

## How to run the automatic installation scripts

### Windows

> [!TIP]
> Run this in an elevated PowerShell window for unattended installation.

> [!IMPORTANT]
> You may need to install [WinGet](https://learn.microsoft.com/en-us/windows/package-manager/winget/#install-winget).
> You may also need to execute `Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process` if you encounter elevation issues.

```powershell
irm win.jfa.dev | iex
```

### Linux

> [!NOTE]
> This is designed exclusively for `apt`-based Linux distributions.

> [!CAUTION]
> Do **not** run this as `sudo` as it uses Homebrew as one of the package managers.

#### WSL

```bash
curl -L wsl.jfa.dev | bash
```

#### Desktop

> [!NOTE]
> This script will piggyback from the WSL script, as it installs basic and CLI packages.

```bash
curl -L linux.jfa.dev | bash
```

## TODO

* [ ] Fonts
* [ ] System preferences
* [ ] Shell preferences
* [ ] Support for additional package managers
