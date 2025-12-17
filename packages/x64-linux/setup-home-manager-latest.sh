#!/bin/bash

# Dynamic Home Manager Channel Setup Script for WSL/Linux
# Automatically detects and uses the latest stable release

set -euo pipefail

echo "Detecting latest Home Manager stable release..."

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

echo "✓ Home Manager installed successfully using $LATEST_RELEASE!"
echo ""
echo "To update to newer releases in the future:"
echo "  1. Run: nix-channel --update"
echo "  2. Run: home-manager switch"
echo ""
echo "The system will automatically use the latest stable release."