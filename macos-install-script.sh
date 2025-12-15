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
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
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

# Post-installation instructions
post_install_info() {
    echo ""
    echo "======================================"
    echo "Nix Installation Complete"
    echo "======================================"
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

    post_install_info
}

# Run main function
main
