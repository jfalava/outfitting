# Config Update API Documentation

The Outfitting installer provides a REST API for fetching and updating individual configuration files without re-running the full installation script.

## Base URLs

- **WSL**: `https://wsl.jfa.dev`
- **Windows**: `https://win.jfa.dev`

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

**Windows (Elevated):**

```powershell
irm win.jfa.dev | iex
```

#### `GET /post-install` (Windows only)

Fetch the Windows post-installation script (requires non-elevated PowerShell).

```powershell
irm win.jfa.dev/post-install | iex
```

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
