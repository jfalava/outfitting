# Outfitting

Scripts, dotfiles and lambdas for the automatic outfitting of my personal machines and VMs.

> [!WARNING]
> Are you installing a LTSC version of Windows? Those are missing the Microsoft Store app, install it along WinGet with [this tool](https://github.com/kkkgo/LTSC-Add-MicrosoftStore).

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

> [!IMPORTANT]
> The post install script **requires** a non-elevated PowerShell session.

```powershell
irm win.jfa.dev/post-install | iex
```

### Linux

> [!NOTE]
> This is designed **exclusively** for `apt`-based Linux distributions.

> [!NOTE]
> You need `cURL` to execute this commands; you may install it by running `sudo apt install curl`.

#### WSL

```bash
curl -L wsl.jfa.dev | bash
```

## TODO

- [ ] Fonts
- [ ] System preferences
  - [x] Windows Registry
  - [ ] Windows Settings (like mouse acceleration)
- [x] Shell preferences
- [ ] ~~Support for additional package managers~~
