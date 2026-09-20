# Outfitting

Outfitting is a cross-platform bootstrap and maintenance system for personal development machines.

[Read the documentation](https://outfitting.jfa.dev/)

## Install

### Windows

Run an elevated PowerShell session. The route selects comma-composable profile bundles:

```powershell
irm win.jfa.dev/base+dev | iex
```

### Linux

The installer detects apt or pacman and defaults to the exclusive `generic-linux` profile:

```bash
curl -L linux.jfa.dev | bash
```

### macOS

```bash
curl -L mac.jfa.dev | bash
```

## Manager workflow

```bash
outfitting-manager init       # initialize and fetch declarations
outfitting-manager setup      # initialize and install missing declarations
outfitting-manager status     # inspect effective local configuration
outfitting-manager update all # upgrade installed software
outfitting-manager sync list  # inspect remote machine state
```

Windows and Linux also provide `apply` to reconcile declarations already cached locally. `apply --prune` removes only packages proven to have been installed by Outfitting for the active profile and no longer declared there.

Use `outfitting-manager sync push <kind> <file>` explicitly to upload local state. Bare `sync push` scans known lock paths in the current directory. Update global Bun packages directly with `bun update -g`.

## Post-install fonts

```powershell
irm win.jfa.dev/post-install | iex
```

```bash
curl -L mac.jfa.dev/post-install | bash
```
