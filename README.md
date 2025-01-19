# Outfitting

Scripts, dotfiles and lambdas for the automatic outfitting of my personal machines and VMs

## Automatic package and profiles install

Single command package install

### How to run

#### Windows

> [!TIP]
> Run this on an elevated permissions PowerShell window for an unattended installation.  

> [!IMPORTANT]
> You might need to execute `Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process` if you have permission issues.

```powershell
irm win.jfa.dev | iex
```

#### Linux

> [!WARNING]
> Do **not** run this as `sudo` as this uses Homebrew as package manager.

```bash
curl -L linux.jfa.dev | bash
```

## How it works

* The [Cloudflare Worker](/cloudflare/src/index.ts) has multiple [subdomains](/cloudflare/wrangler.toml) binded as custom domains that will return a given script depending on which domain was called.
* Each subdomain will call a different script that will update and install packages and CLI shell profiles.

## TODO

* [ ] Fonts
* [ ] System preferences
* [ ] Shell preferences
