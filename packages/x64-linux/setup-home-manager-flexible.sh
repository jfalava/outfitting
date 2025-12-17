#!/bin/bash

# Flexible Home Manager Setup Script for WSL/Linux
# Uses Home Manager from nixpkgs-unstable (most flexible, always latest)

set -euo pipefail

echo "Setting up Home Manager using nixpkgs-unstable (flexible approach)..."

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

echo "✓ Home Manager installed successfully from nixpkgs-unstable!"
echo ""
echo "Benefits of this approach:"
echo "  - Always gets the latest Home Manager version"
echo "  - Managed as part of nixpkgs-unstable updates"
echo "  - No separate channel to manage"
echo "  - More integrated with the nixpkgs ecosystem"
echo ""
echo "To update: nix-channel --update && home-manager switch"