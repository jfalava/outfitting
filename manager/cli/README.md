# Outfitting manager

The `outfitting-manager` binary is the entry point for local Outfitting
maintenance tools.

```bash
bun install
bun run build
mkdir -p ~/.local/bin
ln -sfn "$PWD/dist/outfitting-manager" ~/.local/bin/outfitting-manager
```

Run it without building or linking:

```bash
bun run manager/cli/index.ts --help
```

## Lockfiles

Configure the deployed Worker URL on each client machine:

```bash
outfitting-manager lockfiles configure-worker "https://url-to-your-worker"
```

The CLI stores the URL with `Bun.secrets` using service
`outfitting-lockfiles` and name `worker-url`. If it has not been configured,
the first API call prompts for it. That call also prompts for the bearer token
with masked input and stores it under the same service with name `api-token`.
The token is never echoed after it is entered or saved. This uses Keychain on
macOS, the Secret Service on Linux, and Credential Manager on Windows.
`Bun.secrets` is experimental and is appropriate here as personal credential
storage, not as a hard boundary between programs running as the same user.
Run `configure-worker` again whenever the Worker URL changes.

Set or replace the API token with masked input:

```bash
outfitting-manager lockfiles configure-token
```

Push a lockfile:

```bash
outfitting-manager lockfiles push jfalava:x64-wsl nix packages/x64-wsl/flake.lock
outfitting-manager lockfiles push jfalava:aarch64-darwin homebrew-inventory homebrew-inventory.txt
outfitting-manager lockfiles push jfalava:x64-windows winget winget.json
```

Pull the latest version:

```bash
outfitting-manager lockfiles pull jfalava:x64-wsl nix
outfitting-manager lockfiles pull jfalava:x64-windows winget restored-winget.json
```

The default output filename is inferred for common kinds, including `nix`,
`flake`, `bun`, `npm`, `package-lock`, `homebrew-inventory`, `homebrew`,
`brew`, `brewfile`, and `winget`. Pass an explicit output path for any other
free-form kind.

List kinds and inspect history:

```bash
outfitting-manager lockfiles list jfalava:aarch64-darwin
outfitting-manager lockfiles history jfalava:aarch64-darwin nix
```

Machine names are free-form. Automatic maintenance hooks use the repository's
`username:platform` convention. The current Windows hook uses:

- `jfalava:x64-windows`

macOS uses the `nix` kind as its canonical remote flake lock. Rebuild commands
pull it into a temporary path with Nix's `--reference-lock-file`; upgrades
write to a temporary `--output-lock-file` and push the result after a
successful switch. `outfit snapshot` separately stores the observed,
versioned Homebrew state as `homebrew-inventory`. Kinds are free-form and
require no schema migration.
