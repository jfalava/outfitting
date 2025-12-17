#!/usr/bin/env bash

# Home Manager Channel Setup Script for WSL/Linux
# This script sets up Home Manager using Nix channels instead of flakes

set -euo pipefail

echo "Setting up Home Manager with Nix channels..."

# Add nixpkgs-unstable channel for latest packages
echo "Adding nixpkgs-unstable channel..."
nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs-unstable
nix-channel --update

# Install Home Manager using channel
echo "Installing Home Manager..."
nix-channel --add https://github.com/nix-community/home-manager/archive/release-24.05.tar.gz home-manager
nix-channel --update

# Source the Home Manager installation
export NIX_PATH="$HOME/.nix-defexpr/channels:/nix/var/nix/profiles/per-user/root/channels${NIX_PATH:+:$NIX_PATH}"

# Install Home Manager
echo "Installing Home Manager..."
nix-shell "${HOME}/.nix-defexpr/channels/home-manager" -A install

echo "✓ Home Manager installed successfully using channels!"
echo ""
echo "Next steps:"
echo "1. Copy your home.nix to ~/.config/home-manager/"
echo "2. Run: home-manager switch"
echo ""
echo "To update packages in the future:"
echo "  nix-channel --update && home-manager switch"