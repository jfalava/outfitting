# Outfitting manager

The `outfitting-manager` binary is the entry point for local Outfitting
maintenance tools.

```bash
bun install
bun link
```

Run it without linking:

```bash
bun run manager/cli/index.ts --help
```

## Lockfiles

Set `OUTFITTING_LOCKFILES_URL` to the deployed Worker URL on each client machine:

```bash
export OUTFITTING_LOCKFILES_URL="https://outfitting-lockfiles.<subdomain>.workers.dev"
```

In PowerShell:

```powershell
$env:OUTFITTING_LOCKFILES_URL = "https://outfitting-lockfiles.<subdomain>.workers.dev"
```

The first API call prompts for the bearer token and stores it with
`Bun.secrets` using service `outfitting-lockfiles` and name `api-token`. This
uses Keychain on macOS, the Secret Service on Linux, and Credential Manager on
Windows. `Bun.secrets` is experimental and is appropriate here as personal
credential storage, not as a hard boundary between programs running as the
same user.

Push a lockfile:

```bash
outfitting-manager lockfiles push jfalava:x64-wsl nix packages/x64-wsl/flake.lock
outfitting-manager lockfiles push jfalava:aarch64-darwin bun bun.lock
outfitting-manager lockfiles push jfalava:x64-windows winget winget.json
```

Pull the latest version:

```bash
outfitting-manager lockfiles pull jfalava:x64-wsl nix
outfitting-manager lockfiles pull jfalava:x64-windows winget restored-winget.json
```

The default output filename is inferred for common kinds: `nix`, `flake`,
`bun`, `npm`, `package-lock`, `homebrew`, `brew`, `brewfile`, and `winget`.
Pass an explicit output path for any other free-form kind.

List kinds and inspect history:

```bash
outfitting-manager lockfiles list jfalava:aarch64-darwin
outfitting-manager lockfiles history jfalava:aarch64-darwin nix
```

Machine names are free-form. Automatic maintenance hooks use the repository's
`username:platform` convention. The current Windows hook uses:

- `jfalava:x64-windows`

The macOS and WSL labels are reserved for later integration. Kinds are also
free-form and require no schema migration.
