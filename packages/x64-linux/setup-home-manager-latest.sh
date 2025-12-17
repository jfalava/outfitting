#!/bin/bash

# Dynamic Home Manager Channel Setup Script for WSL/Linux
# Automatically detects and uses the latest stable release

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

echo "Detecting latest Home Manager stable release..."

# Run dependency check first
check_dependencies

# Get the latest stable release branch from GitHub API
LATEST_RELEASE=$(curl -s https://api.github.com/repos/nix-community/home-manager/branches | \
    jq -r '.[].name' | grep -E '^release-[0-9][0-9]\.[0-9][0-9]$' | sort -V | tail -1)

if [[ -z "$LATEST_RELEASE" ]]; then
    echo "⚠ Could not detect latest release, falling back to release-25.11"
    LATEST_RELEASE="release-25.11"
else
    echo "✓ Latest stable release detected: $LATEST_RELEASE"
fi

# Add nixpkgs-unstable channel for latest packages
echo "Adding nixpkgs-unstable channel..."
nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs-unstable
nix-channel --update

# Install Home Manager using the latest detected release
echo "Installing Home Manager from $LATEST_RELEASE..."
nix-channel --add "https://github.com/nix-community/home-manager/archive/${LATEST_RELEASE}.tar.gz" home-manager
nix-channel --update

# Source the Home Manager installation
export NIX_PATH="$HOME/.nix-defexpr/channels:/nix/var/nix/profiles/per-user/root/channels${NIX_PATH:+:$NIX_PATH}"

# Install Home Manager
nix-shell "${HOME}/.nix-defexpr/channels/home-manager" -A install

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

echo "✓ Home Manager installed successfully using $LATEST_RELEASE!"
echo ""
echo "To update to newer releases in the future:"
echo "  1. Run: nix-channel --update"
echo "  2. Run: home-manager switch"
echo ""
echo "The system will automatically use the latest stable release."
echo ""
echo "Note: You may need to restart your shell or run: source $shell_rc"