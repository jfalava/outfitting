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
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
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

# Configure outfitting repository location
configure_outfitting_repo() {
    echo ""
    echo "======================================"
    echo "Repository Configuration"
    echo "======================================"
    echo ""
    
    # Always use default location for remote installation
    repo_path="$HOME/Workspace/outfitting"
    echo "Using default repository location: $repo_path"
    
    # Handle the repository setup
    if [ ! -d "$repo_path" ]; then
        echo "Directory doesn't exist. Creating: $repo_path"
        mkdir -p "$(dirname "$repo_path")"

        echo "Cloning outfitting repository..."
        if git clone https://github.com/jfalava/outfitting.git "$repo_path"; then
            echo "✓ Repository cloned successfully"
        else
            echo "✗ Failed to clone repository, but continuing..."
        fi
    elif [ ! -d "$repo_path/.git" ]; then
        echo "Error: Directory exists but is not a git repository: $repo_path"
        return 1
    else
        echo "✓ Using existing repository at: $repo_path"
    fi

    # Store the configuration
    local config_dir="$HOME/.config/outfitting"
    local config_file="$config_dir/repo-path"

    mkdir -p "$config_dir"
    echo "$repo_path" > "$config_file"
    chmod 600 "$config_file"

    echo "✓ Repository location configured successfully!"
    echo "  Repository path: $repo_path"
    echo "  Configuration stored in: $config_file"
    echo ""
    echo "You can now use local commands like: hm-sync, hm-switch, hm-update"
    echo "To change location later, run: setup-outfitting-repo"

    return 0
}

# Post-installation instructions
post_install_info() {
    echo ""
    echo "======================================"
    echo "Nix Installation Complete"
    echo "======================================"
    echo ""
    echo "Next steps:"
    echo "1. Close this terminal and open a new one (or run: source /etc/zshrc)"
    echo "2. Install nix-darwin for system management:"
    echo "   nix run nix-darwin -- switch --flake github:jfalava/outfitting?dir=packages/aarch64-darwin"
    echo "3. Use 'hm-sync' to apply configuration changes"
    echo ""
    echo "For local development, run 'setup-outfitting-repo' to configure a local clone."
    echo ""
}

# Main installation flow
main() {
    echo ""
    echo "======================================"
    echo "macOS Nix Installation"
    echo "======================================"
    echo ""

    check_macos
    check_architecture

    info "Starting Nix installation..."
    echo ""

    install_nix

    # Configure repository for local development
    configure_outfitting_repo

    post_install_info
}

# Run main function
main
