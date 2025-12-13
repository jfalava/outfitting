# Nix + Home Manager Configuration for WSL

This directory contains a **Home Manager** configuration for managing your WSL development environment declaratively.

## 🚀 Quick Start

### First-time Installation

Run the installation script which will install Nix and Home Manager:

```bash
curl -L wsl.jfa.dev | bash
```

### Manual Home Manager Installation

If you already have Nix installed:

```bash
# From GitHub (recommended)
nix run home-manager/master -- switch --flake "github:jfalava/outfitting?dir=packages/x64-linux#jfalava"

# From local clone
git clone https://github.com/jfalava/outfitting.git
cd outfitting/packages/x64-linux
nix run home-manager/master -- switch --flake .#jfalava
```

## 📁 Files

- **`flake.nix`** - Nix flake definition with Home Manager and nix-ai-tools integration
- **`home.nix`** - Main Home Manager configuration module
- **`flake.lock`** - Lock file for reproducible builds (auto-generated)

## 🎯 What's Managed

### Packages (49 total)

All packages are declaratively managed via `home.packages` in `home.nix`:

**Terminal & Shell:**
- bat, eza, fastfetch, fzf, ripgrep, starship, tree, zenith, zoxide, zsh, zsh-autosuggestions, zsh-syntax-highlighting

**Development Tools:**
- deno, git, go, lazygit, nodejs_latest, python3, zig

**DevOps & IaC:**
- packer, terraform

**CLI Utilities:**
- curl, fd, jq, less, nano, shellcheck, unzip, wget, zip

**Compression Tools:**
- 7zz, p7zip, unrar

**AI & Code Generation:**
- crush (from nix-ai-tools)

### Dotfiles

Managed via `home.file` - automatically symlinked to your home directory:

- **`.zshrc`** → `../../dotfiles/.zshrc-wsl`
- **`.ripgreprc`** → `../../dotfiles/.ripgreprc`

### Program Configurations

Using Home Manager's built-in modules for type-safe configuration:

- **Git** (`programs.git`) - User info, signing, aliases, LFS
- **Zsh** (`programs.zsh`) - Shell with autosuggestions and syntax highlighting
- **Starship** (`programs.starship`) - Cross-shell prompt
- **Zoxide** (`programs.zoxide`) - Smart directory jumper
- **FZF** (`programs.fzf`) - Fuzzy finder with fd integration
- **Bat** (`programs.bat`) - Cat replacement with syntax highlighting
- **Eza** (`programs.eza`) - Modern ls replacement
- **Ripgrep** (`programs.ripgrep`) - Fast search with custom config

### Environment Variables

Set in `home.sessionVariables`:

- `EDITOR`, `VISUAL` → nano
- `PAGER` → less
- `RIPGREP_CONFIG_PATH` → ~/.ripgreprc
- `LESS` with color support for man pages
- Runtime paths: `PNPM_HOME`, `BUN_INSTALL`, `DENO_INSTALL`

### PATH Additions

Managed via `home.sessionPath`:

- `~/.local/bin`
- `~/go/bin`
- `~/.local/share/pnpm`
- `~/.bun/bin`
- `~/.deno/bin`
- `~/.local/share/uv/bin`
- `~/.opencode/bin`
- `~/.cargo/bin`

## 🔄 Updating Your Environment

### Update All Packages

```bash
# Update flake inputs and switch
nix flake update ~/.config/home-manager
home-manager switch --flake "github:jfalava/outfitting?dir=packages/x64-linux#jfalava"
```

### Update Only Home Manager Configuration

```bash
# Pull latest from git
cd ~/outfitting
git pull

# Apply changes
home-manager switch --flake .#jfalava
```

### Update Dotfiles

1. Edit dotfiles in `outfitting/dotfiles/`
2. Commit changes to git
3. Run:
   ```bash
   home-manager switch --flake "github:jfalava/outfitting?dir=packages/x64-linux#jfalava"
   ```

## 🎨 Customization

### Adding Packages

Edit `home.nix` and add to `home.packages`:

```nix
home.packages = with pkgs; [
  # ... existing packages ...
  htop  # Add your package here
];
```

Then apply:
```bash
home-manager switch --flake .#jfalava
```

### Changing Configuration

Edit `home.nix`:

```nix
programs.git = {
  enable = true;
  userName = "Your Name";  # Change here
  userEmail = "your@email.com";
};
```

Apply changes:
```bash
home-manager switch --flake .#jfalava
```

### Search for Packages

```bash
# Search nixpkgs
nix search nixpkgs <package-name>

# Example
nix search nixpkgs htop
```

### Browse Home Manager Options

Visit: https://home-manager-options.extranix.com/

## 🤖 Using Crush (AI Code Generation)

**crush** from `nix-ai-tools` is an AI-powered CLI tool for code generation and analysis.

### Installation

Crush is automatically installed as part of your Home Manager configuration.

### Usage

#### Basic Code Generation

```bash
# Generate a simple function
crush "write a bash function to check if a file exists and is readable"

# Generate code in a specific language
crush --lang python "create a function that validates email addresses"

# With context from files
crush "optimize this function for performance" < my-slow-function.js
```

#### Code Review

```bash
# Analyze code for issues
crush "review this code for security issues" < my-script.sh

# Get explanations
crush "explain what this code does" < complex-code.py
```

#### Common Patterns

```bash
# Generate tests
crush "write unit tests for this function" < function.js

# Create documentation
crush "write JSDoc comments for this code" < index.js

# Refactor code
crush "refactor this code to be more readable" < old-code.py
```

### Configuration

Crush uses environment variables for API keys:

```bash
# OpenAI (default)
export OPENAI_API_KEY="sk-..."

# Or other providers
export ANTHROPIC_API_KEY="..."
```

### Learn More

- GitHub: https://github.com/numtide/nix-ai-tools
- Documentation: https://github.com/numtide/nix-ai-tools#crush

## 🔙 Rollback

Home Manager tracks generations, allowing easy rollback:

```bash
# List generations
home-manager generations

# Rollback to previous
home-manager generations | head -2 | tail -1 | awk '{print $NF}' | sh

# Or manually activate a specific generation
/nix/store/xxxxx-home-manager-generation/activate
```

## 🐛 Troubleshooting

### "collision between packages" error

This happens when a package is both in your profile and Home Manager. Fix:

```bash
# Remove old nix profile packages
nix profile remove '.*'

# Then reinstall via Home Manager
home-manager switch --flake .#jfalava
```

### Dotfile conflicts

If you have existing dotfiles, back them up:

```bash
mv ~/.zshrc ~/.zshrc.backup
mv ~/.ripgreprc ~/.ripgreprc.backup

# Then run home-manager switch
home-manager switch --flake .#jfalava
```

### Nix daemon not running

```bash
# Restart nix daemon (if using multi-user install)
sudo systemctl restart nix-daemon

# Or source nix profile
source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
```

### Home Manager not found

```bash
# Install home-manager
nix run home-manager/master -- init --switch
```

### Crush API errors

```bash
# Verify API key is set
echo $OPENAI_API_KEY

# Test with verbose mode (if available)
crush --verbose "simple test"
```

## 📚 Resources

- [Home Manager Manual](https://nix-community.github.io/home-manager/)
- [Home Manager Options Search](https://home-manager-options.extranix.com/)
- [NixOS Package Search](https://search.nixos.org/packages)
- [Nix Pills](https://nixos.org/guides/nix-pills/)
- [NixOS & Flakes Book](https://nixos-and-flakes.thiscute.world/)
- [nix-ai-tools on GitHub](https://github.com/numtide/nix-ai-tools)

## 🆚 Legacy vs Home Manager

### Old Approach (buildEnv)
```bash
nix profile install github:jfalava/outfitting?dir=packages/x64-linux
curl -o ~/.zshrc https://raw.githubusercontent.com/.../
```

### New Approach (Home Manager)
```bash
home-manager switch --flake github:jfalava/outfitting?dir=packages/x64-linux#jfalava
# Everything (packages + dotfiles) installed atomically
```

Then add the public key to GitHub/GitLab in Settings → SSH and GPG keys → New SSH key → Key type: Signing Key

## 💡 Tips

1. **Always commit your changes** before running `home-manager switch` from GitHub
2. **Use local flake for testing**: `home-manager switch --flake .#jfalava`
3. **Check what changed**: `home-manager news` shows important updates
4. **Garbage collect old generations**: `nix-collect-garbage -d` to free space
5. **Update flake.lock**: `nix flake update` to get latest packages

## 🎯 What's NOT Managed

These are still installed via the install script:

- **APT packages** - System libraries (libssl-dev, build-essential, etc.)
- **Docker** - Installed via Docker's APT repository
- **Runtime installers** - Bun, pnpm, uv (installed via curl for latest versions)
- **LLM CLIs** - OpenCode, Claude CLI (installed via pnpm/curl)

This separation ensures system libraries are managed by APT while user tools are managed by Nix/Home Manager.
