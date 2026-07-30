# Outfitting manager

The `outfitting-manager` binary is the entry point for local Outfitting
maintenance tools. Its command tree is built with the Effect 4 CLI API from
`effect/unstable/cli`; each feature exports a composable command that the root
CLI registers as a subcommand. User-facing status output uses `picocolors` and
respects standard color-support detection.

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
outfitting-manager lockfiles push jfalava:aarch64-darwin nix updated-flake.lock
outfitting-manager lockfiles push jfalava:aarch64-darwin homebrew-inventory homebrew-inventory.txt
outfitting-manager lockfiles push jfalava:x64-windows winget winget.json
```

The CLI refuses to upload files tracked by Git. Repository-owned lockfiles such
as this project's `bun.lock` are already preserved by commits, so duplicating
them in KV provides no recovery value. Generated lock state that is not
committed—such as the canonical macOS flake lock and machine-local package
manager snapshots—remains eligible for upload.

Protect a read-modify-write update by supplying the SHA-256 of the version
that was pulled:

```bash
outfitting-manager lockfiles push jfalava:aarch64-darwin nix updated-flake.lock \
  --if-match 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

The Worker rejects the push with HTTP 412 if another client has advanced that
machine and kind. Retrying content that is already current succeeds.

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
successful switch using the pulled hash as a concurrency precondition. A
durable recovery checkpoint remains under the XDG state directory until both
activation and upload succeed; `outfit recover` resumes it. Successful
`outfit sync` and `outfit upgrade` operations automatically store the
observed, versioned Homebrew state as `homebrew-inventory`. Kinds are
free-form and require no schema migration.
