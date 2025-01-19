# Outfitting

Scripts, dotfiles and lambdas for the automatic outfitting of my personal machines and VMs

## Automatic Package Install

Single command package install

### How to run

#### Windows

```powershell
irm win.jfa.dev | iex
```

#### Linux

```bash
curl -L linux.jfa.dev | bash
```

## How it works

The [Cloudflare Worker](/cloudflare/src/index.ts) has multiple [subdomains](/cloudflare/wrangler.toml) binded as custom domains that will return a given script depending on which domain was called.
