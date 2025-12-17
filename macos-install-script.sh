#!/bin/bash

# ========================================
# macOS Outfitting Installation Script
# ========================================
# Channel-based nix-darwin + Home Manager setup (no flakes)

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

# Install Nix using Determinate Systems installer
install_nix() {
    if command -v nix &> /dev/null; then
        info "Nix is already installed"
        nix --version
    else
        info "Installing Nix (Determinate Systems installer)..."
        curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install

        # Source Nix profile
        if [ -e '/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh' ]; then
            . '/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh'
        fi

        success "Nix installed successfully"
    fi
}

# Install nix-darwin and Home Manager using channels (no flakes)
install_nix_darwin() {
    info "Setting up nix-darwin and Home Manager using channels..."
    
    # Add nixpkgs-unstable channel for latest packages
    info "Adding nixpkgs-unstable channel..."
    nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs-unstable
    nix-channel --update
    
    # Install nix-darwin using channel
    info "Installing nix-darwin..."
    nix-channel --add https://github.com/LnL7/nix-darwin/archive/master.tar.gz darwin
    nix-channel --update
    
    # Bootstrap nix-darwin by building darwin-rebuild
    info "Bootstrapping nix-darwin..."
    nix-build '<darwin>' -A darwin-rebuild
    
    # Install nix-darwin using the built darwin-rebuild
    ./result/bin/darwin-rebuild switch
    
    # Clean up the result symlink
    rm -f result
    
    # Install Home Manager using channel
    info "Installing Home Manager..."
    nix-channel --add https://github.com/nix-community/home-manager/archive/release-25.11.tar.gz home-manager
    nix-channel --update
    
    # Create necessary directories
    mkdir -p ~/.config/home-manager
    mkdir -p ~/.nixpkgs
    
    success "Channels configured successfully!"
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
    echo ""
    echo "❖ You can now use local commands like: hm-sync, hm-switch, hm-update"
    echo "❖ To change location later, run: setup-outfitting-repo"

    return 0
}

# Apply initial nix-darwin configuration
apply_initial_config() {
    info "Applying initial nix-darwin configuration..."
    
    # Check if local repository is configured
    config_file="$HOME/.config/outfitting/repo-path"
    if [ -f "$config_file" ]; then
        repo_path=$(cat "$config_file")
        info "Using local repository: $repo_path"
        
        # Copy configuration files
        cp "$repo_path/packages/aarch64-darwin/darwin.nix" ~/.nixpkgs/darwin-configuration.nix
        cp "$repo_path/packages/aarch64-darwin/home.nix" ~/.config/home-manager/
        
        # Apply configuration using channels (no flakes)
        darwin-rebuild switch || {
            warning "Initial nix-darwin configuration failed."
            warning "You can try again after the script completes:"
            warning "  darwin-rebuild switch"
        }
    else
        info "No local repository found. You'll need to manually configure nix-darwin."
        info "Run 'setup-outfitting-repo' to set up a local repository."
    fi
}

# Post-installation instructions
post_install_info() {
    echo ""
    echo "======================================"
    echo "Installation Complete!"
    echo "======================================"
    echo ""
    echo "✓ Nix installed with channel-based management"
    echo "✓ nix-darwin and Home Manager configured"
    echo "✓ Repository location configured"
    echo ""
    echo "❖ Next steps:"
    echo "  1. Close this terminal and open a new one (or run: source /etc/zshrc)"
    echo "  2. Use 'hm-sync' to apply configuration changes from your repository"
    echo "  3. Use 'hm-update' to update packages (like brew upgrade)"
    echo ""
    echo "❖ To update packages in the future:"
    echo "  nix-channel --update && darwin-rebuild switch"
    echo ""
    echo "❖ Or use the helper functions:"
    echo "  hm-update"
    echo ""
    echo "❖ Your packages will float with nixpkgs-unstable (like Homebrew)"
    echo "❖ No more flake.lock management needed!"
    echo ""
}

# Main installation flow
main() {
    echo ""
    echo "======================================"
    echo "macOS Nix Installation (Channel-based)"
    echo "======================================"
    echo ""

    check_macos
    check_architecture

    info "Starting Nix installation..."
    echo ""

    install_nix
    install_nix_darwin
    
    # Configure repository for local development
    configure_outfitting_repo
    
    # Apply initial configuration
    apply_initial_config

    post_install_info

    # Install Bun global packages from bun.txt
    install_bun_packages
}

# Install Bun global packages from bun.txt
install_bun_packages() {
    info "Installing Bun global packages..."

    if command -v bun >/dev/null 2>&1; then
        local bunPackagesUrl="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/bun.txt"
        local bunPackagesFile="/tmp/bun-packages.txt"

        if curl -fsSL "$bunPackagesUrl" -o "$bunPackagesFile"; then
            while IFS= read -r package; do
                # Skip empty lines and comments
                [[ -z "$package" || "$package" =~ ^[[:space:]]*# ]] && continue
                # Remove leading/trailing whitespace
                package=$(echo "$package" | xargs)
                if [[ -n "$package" ]]; then
                    info "Installing Bun package: $package"
                    bun install -g "$package" || warning "Failed to install $package"
                fi
            done < "$bunPackagesFile"
            rm -f "$bunPackagesFile"
            success "Bun global packages installed"
        else
            warning "Failed to fetch Bun packages list, skipping global package installations"
        fi
    else
        warning "Bun not found, skipping global package installations"
    fi
}

# Run main function
main