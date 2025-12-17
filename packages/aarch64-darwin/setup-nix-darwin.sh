#!/usr/bin/env bash

# nix-darwin + Home Manager Channel Setup Script for macOS
# This script sets up nix-darwin and Home Manager using Nix channels instead of flakes

set -euo pipefail

echo "Setting up nix-darwin and Home Manager with Nix channels..."

# Add nixpkgs-unstable channel for latest packages
echo "Adding nixpkgs-unstable channel..."
nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs-unstable
nix-channel --update

# Install nix-darwin using channel
echo "Installing nix-darwin..."
nix-channel --add https://github.com/LnL7/nix-darwin/archive/master.tar.gz darwin
nix-channel --update

# Source the nix-darwin installation
export NIX_PATH="darwin-config=$HOME/.nixpkgs/darwin-configuration.nix:$HOME/.nix-defexpr/channels:/nix/var/nix/profiles/per-user/root/channels${NIX_PATH:+:$NIX_PATH}"

# Install Home Manager using channel
echo "Installing Home Manager..."
nix-channel --add https://github.com/nix-community/home-manager/archive/release-24.05.tar.gz home-manager
nix-channel --update

# Create necessary directories
mkdir -p ~/.config/home-manager
mkdir -p ~/.nixpkgs

echo "✓ Channels configured successfully!"
echo ""
echo "Next steps:"
echo "1. Copy your darwin.nix to ~/.nixpkgs/darwin-configuration.nix"
echo "2. Copy your home.nix to ~/.config/home-manager/home.nix"
echo "3. Run: darwin-rebuild switch"
echo ""
echo "To update packages in the future:"
echo "  nix-channel --update && darwin-rebuild switch"