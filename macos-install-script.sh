#!/bin/bash

# ========================================
# macOS Outfitting Installation Script
# ========================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
info() {
    echo -e "${BLUE}❖${NC} $1"
}

success() {
    echo -e "${GREEN}❖${NC} $1"
}

warning() {
    echo -e "${YELLOW}❖${NC} $1"
}

error() {
    echo -e "${RED}❖${NC} $1"
}

# Default profile
PROFILE="personal"  # Options: "personal", "work"

# Parse command line arguments
for arg in "$@"; do
    case "$arg" in
        --work-profile)
            PROFILE="work"
            ;;
        --personal-profile)
            PROFILE="personal"
            ;;
    esac
done

# Check if running on macOS
check_macos() {
    if [[ "$(uname)" != "Darwin" ]]; then
        error "This script is for macOS only."
        exit 1
    fi
    success "Running on macOS"
}

# Check if running on Apple Silicon
check_architecture() {
    local arch
    arch=$(uname -m)

    if [[ "$arch" == "arm64" ]]; then
        info "Detected Apple Silicon (ARM64)"
    elif [[ "$arch" == "x86_64" ]]; then
        warning "Detected Intel Mac (x86_64)"
        warning "This configuration is optimized for Apple Silicon."
        warning "It may work on Intel Macs, but some packages might need adjustment."
        warning "Continuing with installation..."
    else
        error "Unsupported architecture: $arch"
        exit 1
    fi
}

# Configure outfitting repository location
configure_outfitting_repo() {
    echo ""
    echo "======================================"
    echo "Repository Configuration"
    echo "======================================"
    echo ""

    # Always use default location for remote installation
    repo_path="$HOME/Workspace/outfitting"
    echo "❖ Using default repository location: $repo_path"

    # Handle the repository setup
    if [ ! -d "$repo_path" ]; then
        echo "❖ Directory doesn't exist. Creating: $repo_path"
        mkdir -p "$(dirname "$repo_path")"

        echo "❖ Cloning outfitting repository..."
        if git clone https://github.com/jfalava/outfitting.git "$repo_path"; then
            echo "✓ Repository cloned successfully"
        else
            echo "✗ Failed to clone repository, but continuing..."
        fi
    elif [ ! -d "$repo_path/.git" ]; then
        error "Directory exists but is not a git repository: $repo_path"
        return 1
    else
        echo "✓ Using existing repository at: $repo_path"
    fi

    # Store the configuration
    config_dir="$HOME/.config/outfitting"
    config_file="$config_dir/repo-path"

    mkdir -p "$config_dir"
    echo "$repo_path" > "$config_file"
    chmod 600 "$config_file"

    echo "✓ Repository location configured successfully!"
    echo "  Repository path: $repo_path"
    echo "  Configuration stored in: $config_file"

    return 0
}

# Copy dotfiles before Nix installation
copy_dotfiles() {
    info "Copying dotfiles..."

    config_file="$HOME/.config/outfitting/repo-path"
    if [ -f "$config_file" ]; then
        repo_path=$(cat "$config_file")
        info "Using repository at: $repo_path"

        # Backup existing zsh files if they exist
        if [ -f "$HOME/.zshrc" ] && [ ! -L "$HOME/.zshrc" ]; then
            info "Backing up existing .zshrc..."
            mv "$HOME/.zshrc" "$HOME/.zshrc.backup.$(date +%Y%m%d-%H%M%S)"
        fi
        if [ -f "$HOME/.zshrc-base" ] && [ ! -L "$HOME/.zshrc-base" ]; then
            info "Backing up existing .zshrc-base..."
            mv "$HOME/.zshrc-base" "$HOME/.zshrc-base.backup.$(date +%Y%m%d-%H%M%S)"
        fi

        # Copy dotfiles
        info "Copying .zshrc-macos to .zshrc..."
        cp "$repo_path/dotfiles/.zshrc-macos" "$HOME/.zshrc"

        info "Copying .zshrc-base..."
        cp "$repo_path/dotfiles/.zshrc-base" "$HOME/.zshrc-base"

        success "Dotfiles copied successfully!"
    else
        warning "Repository not configured. Skipping dotfile copy."
    fi
}

# Install Bun via official installer
install_bun() {
    info "Installing Bun..."

    if command -v bun &> /dev/null; then
        success "Bun is already installed ($(bun --version))"
        # Still export for current session
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
        return 0
    fi

    if curl -fsSL https://bun.sh/install | bash; then
        # Source Bun in current session
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
        success "Bun installed successfully"
    else
        warning "Failed to install Bun (network error or already installed)"
        # Try to source it anyway in case it's already there
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
    fi
}

# Install Bun global packages from bun.txt
install_bun_packages() {
    info "Installing Bun global packages..."

    if ! command -v bun >/dev/null 2>&1; then
        warning "Bun not found in PATH, skipping global package installations"
        return 0
    fi

    local bunPackagesUrl="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/bun.txt"
    local bunPackagesFile="/tmp/bun-packages.txt"

    if ! curl -fsSL "$bunPackagesUrl" -o "$bunPackagesFile" 2>/dev/null; then
        warning "Failed to fetch Bun packages list (network error), skipping"
        return 0
    fi

    local installed=0
    local failed=0
    while IFS= read -r package; do
        # Skip empty lines and comments
        [[ -z "$package" || "$package" =~ ^[[:space:]]*# ]] && continue
        # Remove leading/trailing whitespace
        package=$(echo "$package" | xargs)
        if [[ -n "$package" ]]; then
            # Check if already installed (idempotent)
            if bun pm ls -g 2>/dev/null | grep -q "^$package@"; then
                info "Package already installed: $package"
                ((installed++))
            else
                info "Installing Bun package: $package"
                if bun install -g "$package" 2>/dev/null; then
                    ((installed++))
                else
                    warning "Failed to install: $package"
                    ((failed++))
                fi
            fi
        fi
    done < "$bunPackagesFile"
    rm -f "$bunPackagesFile"

    if [[ $installed -gt 0 ]]; then
        success "Bun packages: $installed installed/verified"
    fi
    if [[ $failed -gt 0 ]]; then
        warning "Bun packages: $failed failed"
    fi
}

# Install Claude Code
install_claude_code() {
    info "Installing Claude Code..."

    # Check if already installed
    if command -v claude &> /dev/null; then
        success "Claude Code is already installed"
        return 0
    fi

    if curl -fsSL https://claude.ai/install.sh 2>/dev/null | bash; then
        success "Claude Code installed"
    else
        warning "Failed to install Claude Code (network error or already installed)"
    fi
}

# Install Nix with flakes support
install_nix() {
    if command -v nix &> /dev/null; then
        success "Nix is already installed ($(nix --version | head -1))"
        return 0
    fi

    info "Installing Nix (Determinate Systems installer with flakes)..."
    if curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix 2>/dev/null | sh -s -- install; then
        # Source Nix profile
        if [ -e '/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh' ]; then
            . '/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh'
        fi
        success "Nix installed successfully with flakes enabled"
    else
        error "Failed to install Nix (network error)"
        return 1
    fi
}

# Install nix-darwin using flakes
install_nix_darwin() {
    # Check if already installed
    if command -v darwin-rebuild &> /dev/null; then
        success "nix-darwin is already installed"
        info "To update: darwin-rebuild switch --flake ~/.config/home-manager"
        return 0
    fi

    info "Installing nix-darwin with flakes..."

    config_file="$HOME/.config/outfitting/repo-path"
    if [ ! -f "$config_file" ]; then
        error "Repository not configured. Cannot install nix-darwin."
        return 1
    fi

    repo_path=$(cat "$config_file")
    info "Using repository at: $repo_path"

    # Backup /etc/zshenv if it exists
    if [ -f /etc/zshenv ]; then
        info "Backing up /etc/zshenv..."
        sudo mv /etc/zshenv /etc/zshenv.before-nix-darwin
    fi

    # Prepare configuration based on profile
    if [ "$PROFILE" = "work" ]; then
        info "Configuring work profile..."
        # Copy configuration to ~/.config/home-manager and modify
        mkdir -p ~/.config
        if [ -d ~/.config/home-manager ]; then
            mv ~/.config/home-manager ~/.config/home-manager.backup.$(date +%Y%m%d-%H%M%S)
        fi
        cp -r "$repo_path/packages/aarch64-darwin" ~/.config/home-manager
        # Modify the activeProfile in home.nix
        sed -i '' 's/activeProfile = "personal";/activeProfile = "work";/' ~/.config/home-manager/home.nix
        flake_path="$HOME/.config/home-manager"
        success "Profile set to: work"
    else
        info "Using personal profile (default)"
        # Use repository directly
        flake_path="$repo_path/packages/aarch64-darwin"
    fi

    info "Building nix-darwin from flake at: $flake_path"
    if nix run nix-darwin -- switch --flake "$flake_path" 2>&1; then
        success "nix-darwin installed successfully!"
        info "Configuration is now managed via flake at: $flake_path/flake.nix"
        if [ "$PROFILE" = "work" ]; then
            info "To update in the future, run: darwin-rebuild switch --flake ~/.config/home-manager"
        else
            info "To update in the future, run: hm-sync (or darwin-rebuild switch --flake $flake_path)"
        fi
    else
        error "Failed to install nix-darwin"
        warning "You can retry manually with: nix run nix-darwin -- switch --flake $flake_path"
        return 1
    fi
}

# Post-installation instructions
post_install_info() {
    echo ""
    echo "======================================"
    echo "Installation Complete!"
    echo "======================================"
    echo ""
    echo "To update nix-darwin: darwin-rebuild switch --flake ~/.config/home-manager"
    echo ""
}

# Main installation flow
main() {
    echo ""
    echo "======================================"
    echo "macOS Installation (Flake-based)"
    echo "======================================"
    echo ""

    check_macos
    check_architecture

    # Step 1: Configure repository
    configure_outfitting_repo

    # Step 2: Copy dotfiles first (before Nix, so shell works)
    copy_dotfiles

    # Step 3: Install Bun
    install_bun

    # Step 4: Install Bun packages
    install_bun_packages

    # Step 5: Install Claude Code
    install_claude_code

    # Step 6: Install Nix (last, with flakes)
    info "Now installing Nix and nix-darwin..."
    echo ""
    install_nix
    install_nix_darwin

    post_install_info
}

# Run main function
main
