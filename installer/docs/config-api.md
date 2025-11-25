# Config Update API Documentation

The Outfitting installer provides a REST API for fetching and updating individual configuration files without re-running the full installation script.

## Base URLs

- **WSL**: `https://wsl.jfa.dev`
- **Windows**: `https://win.jfa.dev`

## Endpoints

### Individual Config Files

#### `GET /config/:file`

Fetch a specific configuration file.

**Available files:**

| File Key | Description | Output Path (WSL) | Output Path (Windows) |
|----------|-------------|-------------------|----------------------|
| `zshrc` | ZSH configuration | `~/.zshrc` | N/A |
| `ripgreprc` | Ripgrep configuration | `~/.ripgreprc` | N/A |
| `gitconfig` | Git configuration | `~/.gitconfig` | Works on both |
| `powershell` | PowerShell profile | N/A | `$PROFILE` |

**Example Requests:**

```bash
# WSL
curl -fsSL wsl.jfa.dev/config/zshrc -o ~/.zshrc
curl -fsSL wsl.jfa.dev/config/ripgreprc -o ~/.ripgreprc
curl -fsSL wsl.jfa.dev/config/gitconfig -o ~/.gitconfig

# Windows
Invoke-WebRequest -Uri "https://win.jfa.dev/config/powershell" -OutFile $PROFILE
```

### Batch Update Script

#### `GET /config/all`

Generate a shell script that updates all configuration files with automatic backups.

**WSL Response:**

Returns a bash script that:
1. Creates timestamped backups of existing configs
2. Downloads all dotfiles (`.zshrc`, `.ripgreprc`, `.gitconfig`)
3. Displays update status

**Example:**

```bash
curl -fsSL wsl.jfa.dev/config/all | bash
```

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
- Content-Type: `text/x-shellscript` (WSL) or `application/x-powershell` (Windows)
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

### Scenario 1: Quick Config Update

You've updated your `.zshrc` on GitHub and want to pull it down:

```bash
# With built-in function (if already installed)
update-zshrc

# Or directly via curl
curl -fsSL wsl.jfa.dev/config/zshrc -o ~/.zshrc
source ~/.zshrc
```

### Scenario 2: Update All Dotfiles

After making changes to multiple config files:

```bash
# WSL - Updates all with automatic backups
curl -fsSL wsl.jfa.dev/config/all | bash

# Or use the built-in function
update-dotfiles
```

### Scenario 3: Setup New Machine

Fresh install on a new machine:

```bash
# Full installation (installs packages, runtimes, configs)
curl -L wsl.jfa.dev | bash
```

### Scenario 4: Selective Updates

Update only specific configs:

```bash
# Update just ripgrep config
curl -fsSL wsl.jfa.dev/config/ripgreprc -o ~/.ripgreprc

# Update just git config
curl -fsSL wsl.jfa.dev/config/gitconfig -o ~/.gitconfig
```

## Shell Functions (After Installation)

The installation script adds these convenience functions to your shell:

### WSL Functions

```bash
update-dotfiles       # Update all configs with automatic backups
update-zshrc         # Update .zshrc only
update-ripgreprc     # Update .ripgreprc only
update-gitconfig     # Update .gitconfig only
```

All functions:
- Create timestamped backups (`.backup.YYYYMMDD_HHMMSS`)
- Show success/error messages
- Provide reload instructions

**Example Output:**

```bash
$ update-zshrc
Updating .zshrc...
Backed up current .zshrc
✓ Updated ~/.zshrc
Reload your shell with: source ~/.zshrc
```
