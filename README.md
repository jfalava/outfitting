# Outfitting

Scripts, dotfiles and lambdas for the automatic outfitting of my personal machines and VMs.

## Automatic Package and Profile Installation

Single command package installation.

### How to Run

#### Windows

> [!TIP]
> Run this in an elevated PowerShell window for unattended installation.

> [!IMPORTANT]
> You might need to execute `Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process` if you encounter permission issues.

```powershell
irm win.jfa.dev | iex
```

#### Linux

> [!NOTE]
> This is designed exclusively for `apt`-based Linux distributions.

> [!WARNING]
> Do **not** run this as `sudo` as it uses Homebrew as the package manager.

```bash
curl -L linux.jfa.dev | bash
```

## How It Works

* A [Cloudflare Worker](/cloudflare/src/index.ts) has multiple [subdomains](/cloudflare/wrangler.toml) bound as custom domains that return specific scripts based on the called domain.
* Each subdomain triggers a different script that updates and installs packages and CLI shell profiles.

## TODO

* [ ] Fonts
* [ ] System preferences
* [ ] Shell preferences
* [ ] Support for additional package managers
