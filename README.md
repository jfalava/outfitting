# Outfitting

Scripts, dotfiles and lambdas for the automatic outfitting of my personal machines and VMs.

> [!WARNING]
> Are you installing a LTSC version of Windows? Those are missing the Microsoft Store app, install it along WinGet with [this tool](https://github.com/kkkgo/LTSC-Add-MicrosoftStore).

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
>
> This is designed **exclusively** for `apt`-based Linux distributions **and** only tested on WSL Ubuntu and Ubuntu 24.04.  
>  No other `apt` distros will be tested.

> [!NOTE]
>
> You need `cURL` to execute this commands; you may install it by running `sudo apt install curl`.

```sh
curl -L wsl.jfa.dev | bash
```

## TODO

- [ ] Fonts
- [ ] System preferences
  - [x] Windows Registry
  - [ ] Windows Settings (like mouse acceleration)
- [x] Shell preferences
- [ ] ~~Support for additional package managers~~
