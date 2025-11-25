# Outfitting

Scripts, dotfiles and lambdas for the automatic outfitting of my personal machines and VMs.

> [!WARNING]
> Are you installing an LTSC version of Windows? Those are missing the Microsoft Store app, install it along WinGet with [this tool](https://github.com/kkkgo/LTSC-Add-MicrosoftStore).

## How to run the automatic installation scripts

### Windows

- Run the following commands:

> [!IMPORTANT]
>
> - You may need to install or update [WinGet](https://learn.microsoft.com/en-us/windows/package-manager/winget/#install-winget).
> - A regular Windows machine will have it installed, but it might be outdated. Open this [link to the Microsoft Store](https://apps.microsoft.com/detail/9NBLGGH4NNS1) and update it if needed.
> - You may also need to execute `Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process` if you encounter elevation issues.

```powershell
irm win.jfa.dev | iex # open an elevated PowerShell window for unattended installation.
```

```powershell
irm win.jfa.dev/post-install | iex # the post install script requires a non-elevated PowerShell window or it will fail
```

### WSL

> [!IMPORTANT]
> This is designed **exclusively** for `apt`-based Linux distributions **and** only tested on Ubuntu and Ubuntu 24.04.

> [!NOTE]
> You need `cURL` to execute this command, you may install it by running `sudo apt install curl`.

```sh
curl -L wsl.jfa.dev | bash
```

## Updating Config Files

After initial installation, you can quickly update individual dotfiles without re-running the full installation script.

### WSL/Linux

```bash
# Update all dotfiles at once
curl -fsSL wsl.jfa.dev/config/all | bash

# Or update individual files
curl -fsSL wsl.jfa.dev/config/zshrc -o ~/.zshrc
curl -fsSL wsl.jfa.dev/config/ripgreprc -o ~/.ripgreprc
curl -fsSL wsl.jfa.dev/config/gitconfig -o ~/.gitconfig
```

If you've already run the installation script, you can use these convenient shell functions:

```bash
update-dotfiles       # Update all configs with automatic backups
update-zshrc         # Update just .zshrc
update-ripgreprc     # Update just .ripgreprc
update-gitconfig     # Update just .gitconfig
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
- [ ] ~~Support for additional package managers~~
