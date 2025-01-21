# Outfitting

Scripts, dotfiles and lambdas for the automatic outfitting of my personal machines and VMs.

## Automatic Package and Profile Installation

Single command package installation.

### How to Run

#### Windows

> [!TIP]
> Run this in an elevated PowerShell window for unattended installation.

> [!IMPORTANT]
> You may need to install [WinGet](https://learn.microsoft.com/en-us/windows/package-manager/winget/#install-winget).  
> You may also need to execute `Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process` if you encounter elevation issues.  

```powershell
irm win.jfa.dev | iex
```

#### Linux

> [!NOTE]
> This is designed exclusively for `apt`-based Linux distributions.

> [!WARNING]
> Do **not** run this as `sudo` as it uses Homebrew as one of the package managers.

```bash
curl -L linux.jfa.dev | bash
```

## How It Works

* This [Cloudflare Worker](/cloudflare/src/index.ts) serves platform-specific installation scripts based on the request [hostname](/cloudflare/wrangler.toml).  
* The scripts are fetched from GitHub and returned with appropriate content types.  
* Then, the scripts are executed, installing and updating packages, settings and profiles.

## TODO

* [ ] Fonts
* [ ] System preferences
* [ ] Shell preferences
* [ ] Support for additional package managers
