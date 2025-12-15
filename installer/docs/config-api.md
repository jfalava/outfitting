# Config Update API Documentation

The Outfitting installer provides a REST API for fetching and updating individual configuration files without re-running the full installation script.

## Architecture

The API is built with:

- **Framework**: [Hono](https://hono.dev/) - Fast, lightweight web framework for Cloudflare Workers
- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **Structure**: Domain-based routing with OS-specific route handlers

### Route Organization

Routes are organized by target OS:

- `src/windows.ts` - Windows-specific routes (/, /post-install, /config/*)
- `src/wsl.ts` - WSL/Linux routes (/)
- `src/macos.ts` - macOS routes (/)
- `src/constants.ts` - Shared constants (URLs, hosts, content types)
- `src/utils.ts` - Common utilities (headers, fetch helpers)

Domain validation middleware ensures requests are routed to the correct OS handler based on the Host header.

### Security

- **Domain Whitelisting**: Only requests from `wsl.jfa.dev`, `win.jfa.dev`, and `mac.jfa.dev` are allowed
- **No Authentication**: Scripts are publicly accessible (by design, for easy machine setup)
- **CORS Enabled**: All origins allowed for script fetching
- **No Cache**: All responses include `Cache-Control: no-cache` to ensure latest versions

### Error Responses

| Status Code | Description                                      |
| ----------- | ------------------------------------------------ |
| `418`       | I'm a teapot - Invalid domain or unknown route   |
| `400`       | Invalid config file requested                    |
| `500`       | Failed to fetch script/config from GitHub        |

## Base URLs

- **WSL**: `https://wsl.jfa.dev`
- **Windows**: `https://win.jfa.dev`
- **macOS**: `https://mac.jfa.dev`

## Endpoints

### Individual Config Files

#### `GET /config/:file`

Fetch a specific configuration file (Windows only).

**Available files:**

| File Key     | Description        | Output Path | Platform |
| ------------ | ------------------ | ----------- | -------- |
| `powershell` | PowerShell profile | `$PROFILE`  | Windows  |

**Example Request:**

```powershell
# Windows
Invoke-WebRequest -Uri "https://win.jfa.dev/config/powershell" -OutFile $PROFILE
```

### Batch Update Script

#### `GET /config/all`

Generate a PowerShell script that updates the PowerShell profile with automatic backup (Windows only).

**Windows Response:**

Returns a PowerShell script that:

1. Creates timestamped backup of existing PowerShell profile
2. Downloads the latest PowerShell profile
3. Displays update status

**Example:**

```powershell
irm win.jfa.dev/config/all | iex
```

**Response:**

- Content-Type: `application/x-powershell`
- Body: Executable script content

### Main Installation Scripts

#### `GET /`

Fetch the main installation script for full system setup.

**WSL:**

```bash
curl -L wsl.jfa.dev | bash
```

**macOS:**

```bash
curl -L mac.jfa.dev | bash
```

**Windows (Elevated):**

```powershell
irm win.jfa.dev | iex
```

**Response:**

- Content-Type: `text/x-shellscript` (WSL/macOS) or `application/x-powershell` (Windows)
- Cache-Control: `no-cache`
- Body: Installation script fetched from GitHub main branch

#### `GET /post-install` (Windows only)

Fetch the Windows post-installation script (requires non-elevated PowerShell).

```powershell
irm win.jfa.dev/post-install | iex
```

**Response:**

- Content-Type: `application/x-powershell`
- Cache-Control: `no-cache`
- Body: Post-installation script content

## Usage Examples

### Scenario 1: Update WSL Dotfiles

WSL dotfiles are managed by Home Manager. To update:

```bash
# Sync from GitHub
hm-sync

# Or manually
home-manager switch --flake github:jfalava/outfitting?dir=packages/x64-linux#jfalava
```

### Scenario 2: Update Windows PowerShell Profile

After making changes to the PowerShell profile:

```powershell
# Windows - Updates with automatic backup
irm win.jfa.dev/config/all | iex

# Or update just the profile
Invoke-WebRequest -Uri "https://win.jfa.dev/config/powershell" -OutFile $PROFILE
. $PROFILE
```

### Scenario 3: Setup New Machine

Fresh install on a new machine:

```bash
# WSL - Full installation
curl -L wsl.jfa.dev | bash
```

```bash
# macOS - Full installation
curl -L mac.jfa.dev | bash
```

```powershell
# Windows - Full installation (elevated PowerShell)
irm win.jfa.dev | iex

# Windows - Post-install (non-elevated PowerShell)
irm win.jfa.dev/post-install | iex
```

## Shell Functions (After Installation)

### WSL Functions

WSL dotfiles are managed by Home Manager. Use these commands:

```bash
hm-sync              # Sync Home Manager config from GitHub
hm-clean             # Clean old Home Manager generations
```

**Example:**

```bash
$ hm-sync
Switching to home-manager configuration...
✓ Home Manager configuration applied
Reload your shell with: source ~/.zshrc
```

## Development

### Project Structure

```
installer/
├── src/
│   ├── index.ts          # Main entry point with middleware
│   ├── constants.ts      # Shared constants (URLs, hosts, types)
│   ├── utils.ts          # Common utilities (fetch, headers)
│   ├── windows.ts        # Windows route handler
│   ├── wsl.ts            # WSL route handler
│   └── macos.ts          # macOS route handler
├── docs/
│   └── config-api.md     # This file
└── package.json
```

### Shared Constants (`src/constants.ts`)

All route handlers use centralized constants:

- `GITHUB_RAW_BASE` - Base URL for fetching scripts
- `ALLOWED_HOSTS` - Whitelist of allowed domains
- `SCRIPT_URLS` - Mapping of all script URLs
- `CONTENT_TYPES` - Standard content type definitions
- `CONFIG_FILES` - Windows config file mappings

### Shared Utilities (`src/utils.ts`)

Common functions used across route handlers:

- `setScriptHeaders(c, contentType)` - Sets standard response headers
- `fetchScript(url)` - Fetches scripts with consistent settings
- `fetchConfigFile(config)` - Fetches config files with error handling

### Development Commands

```bash
cd installer

# Start dev server
bun run dev

# Type checking
bun run typecheck

# Linting
bun run lint

# Formatting
bun run format

# Deploy to Cloudflare
bun run deploy
```

### Adding New Routes

1. Add route to appropriate OS handler (`windows.ts`, `wsl.ts`, or `macos.ts`)
2. Use shared constants from `constants.ts`
3. Use utility functions from `utils.ts` for consistency
4. Update this documentation

**Example:**

```typescript
// In windows.ts
import { SCRIPT_URLS, CONTENT_TYPES } from "./constants";
import { fetchScript, setScriptHeaders } from "./utils";

windowsApp.get("/new-route", async (c) => {
  const script = await fetchScript(SCRIPT_URLS.windows);
  if (!script) {
    return c.text("Failed to fetch script", 500);
  }
  
  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(script);
});
```
