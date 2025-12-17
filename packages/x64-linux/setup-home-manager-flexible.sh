#!/bin/bash

# Flexible Home Manager Setup Script for WSL/Linux
# Uses Home Manager from nixpkgs-unstable (most flexible, always latest)

set -euo pipefail

# Preflight dependency validation
check_dependencies() {
    local missing_deps=()
    
    # Check for curl
    if ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi
    
    # Check for jq
    if ! command -v jq >/dev/null 2>&1; then
        missing_deps+=("jq")
    fi
    
    # Check for nix-channel (should be available if Nix is installed)
    if ! command -v nix-channel >/dev/null 2>&1; then
        missing_deps+=("nix-channel (Nix not installed?)")
    fi
    
    # If any dependencies are missing, print error and exit
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        echo "Error: Missing required dependencies: ${missing_deps[*]}"
        echo ""
        echo "Installation suggestions:"
        if [[ " ${missing_deps[*]} " =~ " curl " ]]; then
            echo "  - curl: sudo apt install curl  # or your package manager"
        fi
        if [[ " ${missing_deps[*]} " =~ " jq " ]]; then
            echo "  - jq: sudo apt install jq  # or brew install jq on macOS"
        fi
        if [[ " ${missing_deps[*]} " =~ "nix-channel" ]]; then
            echo "  - Nix: Install from https://nixos.org/download.html"
        fi
        echo ""
        echo "Please install the missing dependencies and run this script again."
        exit 1
    fi
    
    echo "✓ All dependencies satisfied"
}

echo "Setting up Home Manager using nixpkgs-unstable (flexible approach)..."

# Run dependency check first
check_dependencies

# Add nixpkgs-unstable channel - this includes the latest Home Manager
echo "Adding nixpkgs-unstable channel..."
nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs-unstable
nix-channel --update

# Install Home Manager directly from nixpkgs-unstable
echo "Installing Home Manager from nixpkgs-unstable..."

# Method 1: Install home-manager from nixpkgs-unstable
nix-env -iA nixpkgs-unstable.home-manager

# Method 2: Add as channel (alternative)
# nix-channel --add https://github.com/nix-community/home-manager/archive/master.tar.gz home-manager
# nix-channel --update

# Source the Home Manager installation
export NIX_PATH="nixpkgs=$HOME/.nix-defexpr/channels/nixpkgs-unstable:/nix/var/nix/profiles/per-user/root/channels${NIX_PATH:+:$NIX_PATH}"

# Make NIX_PATH persistent across shell sessions
echo "Making NIX_PATH persistent across shell sessions..."
if [[ -n "${ZSH_VERSION:-}" ]]; then
    shell_rc="$HOME/.zshrc"
elif [[ -n "${BASH_VERSION:-}" ]]; then
    shell_rc="$HOME/.bashrc"
else
    shell_rc="$HOME/.profile"
fi

if ! grep -q "export NIX_PATH=" "$shell_rc" 2>/dev/null; then
    {
        echo ""
        echo "# Added by Home Manager setup script"
        echo "export NIX_PATH=\"$NIX_PATH\""
    } >> "$shell_rc"
    echo "✓ Added NIX_PATH to $shell_rc"
else
    echo "ℹ NIX_PATH already exists in $shell_rc"
fi

echo "✓ Home Manager installed successfully from nixpkgs-unstable!"
echo ""
echo "Benefits of this approach:"
echo "  - Always gets the latest Home Manager version"
echo "  - Managed as part of nixpkgs-unstable updates"
echo "  - No separate channel to manage"
echo "  - More integrated with the nixpkgs ecosystem"
echo ""
echo "To update: nix-channel --update && home-manager switch"
echo ""
echo "Note: You may need to restart your shell or run: source $shell_rc"