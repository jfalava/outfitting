# Installer Worker

Cloudflare Worker that powers Outfitting install endpoints:

- `win.jfa.dev`
- `wsl.jfa.dev`
- `mac.jfa.dev`

The worker routes by `Host` header and serves scripts/config from `main` branch GitHub raw URLs.

## Responsibilities

- host-based routing to OS-specific handlers
- profile validation for Windows package composition
- script/config passthrough for installer commands
- standard script response headers and no-cache policy

## Endpoint Summary

### Windows (`win.jfa.dev`)

- `GET /` -> help/usage PowerShell script
- `GET /:profile` -> WinGet install script (`base+dev+...` supported)
- `GET /msstore/:profile` -> Microsoft Store install script (`msstore-*` composition)
- `GET /bun` -> Bun global packages install script
- `GET /packages/:profile` -> raw WinGet package list
- `GET /packages/msstore/:profile` -> raw MS Store package list
- `GET /config/powershell` -> PowerShell profile content
- `GET /config/pwsh-profile` -> profile updater script
- `GET /post-install` -> post-install PowerShell script (requires elevation)
- `GET|HEAD /fonts` -> protected private-font archive from R2
- `GET|HEAD /fonts/checksum` -> protected SHA-256 sidecar for the archive

### WSL (`wsl.jfa.dev`)

- `GET /` -> main WSL install script
- `GET /packages/bun` -> Bun package list

### macOS (`mac.jfa.dev`)

- `GET /` -> main macOS install script
- `GET /post-install` -> post-install shell script (requires `sudo`)
- `GET /packages/bun` -> Bun package list
- `GET|HEAD /fonts` -> protected private-font archive from R2
- `GET|HEAD /fonts/checksum` -> protected SHA-256 sidecar for the archive

## Private fonts

The private font endpoints stream `releases/fonts-current.tar.gz` and its
`releases/fonts-current.tar.gz.sha256` sidecar from the Worker-bound,
non-public R2 bucket. The archive contains only `.otf`, `.ttf`, or `.ttc`
files beneath a single `fonts/` directory. Release promotion is performed by
uploading the approved archive and checksum to those keys; the Worker never
lists bucket contents.

Cloudflare Access must protect both `/fonts` and `/fonts/checksum` on the
Windows and macOS hostnames. It must use the existing identity provider and
allow only users entitled to receive the licensed fonts. The desktop scripts
authenticate interactively with `cloudflared access login`, then download with
`cloudflared access curl`; they never receive R2 credentials.

Both post-install scripts require administrator privileges and install these
fonts for all local users (`C:\\Windows\\Fonts` on Windows and `/Library/Fonts`
on macOS). Access controls download authorization only; make sure the font
licenses permit delivery to every identity covered by the Access policy.

## Project Layout

- `src/index.ts`: host validation and host-based dispatch
- `src/windows.ts`: Windows routes, profile composition, config APIs
- `src/wsl.ts`: WSL routes
- `src/macos.ts`: macOS routes
- `src/constants.ts`: route and script constants
- `src/utils.ts`: response headers and fetch helpers
- `docs/config-api.md`: detailed API notes

## Local Development

```bash
cd installer
bun install
bun run dev
```

Useful commands:

```bash
bun run typecheck
bun run lint
bun run format
bun run check
```

## Deploy

```bash
bun run deploy
```

Routes and domain mapping are configured in `wrangler.jsonc`.

## Implementation Notes

- Domain allowlist is enforced; unknown hosts return `418`.
- Package profiles are validated before script generation.
- Script URLs resolve from `https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main`.
- Worker is intentionally stateless and fetch-driven.
