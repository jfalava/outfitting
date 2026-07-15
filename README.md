# Outfitting

Outfitting is a cross-platform bootstrap system for personal development machines.

[Official Outfitting documentation](https://outfitting.jfa.dev/)

## Quick Start

> [!WARNING]
> Windows LTSC does not include Microsoft Store by default. Install Store + WinGet first with [LTSC-Add-MicrosoftStore](https://github.com/kkkgo/LTSC-Add-MicrosoftStore).

### [Windows](https://outfitting.jfa.dev/docs/windows)

```powershell
irm win.jfa.dev | iex # Running this shows all the options
```

### [WSL (Ubuntu-based)](https://outfitting.jfa.dev/docs/wsl)

```bash
curl -L wsl.jfa.dev | bash
```

### [macOS](https://outfitting.jfa.dev/docs/macos)

```bash
curl -L mac.jfa.dev | bash
```

### Post-install scripts

Run these after the main installer to perform post-install work, including the
Cloudflare Access-protected, system-wide licensed font installation:

```powershell
irm win.jfa.dev/post-install | iex
```

```bash
curl -L mac.jfa.dev/post-install | bash
```
