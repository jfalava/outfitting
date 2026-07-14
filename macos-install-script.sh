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
    echo "Repository Configuration"
    echo ""

    # Always use default location for remote installation
    repo_path="$HOME/.config/outfitting/repo"
    info "Using default repository location: $repo_path"

    # Handle the repository setup
    if [ ! -d "$repo_path" ]; then
        info "Directory doesn't exist. Creating: $repo_path"
        mkdir -p "$(dirname "$repo_path")"

        info "Cloning outfitting repository..."
        if git clone https://github.com/jfalava/outfitting.git "$repo_path"; then
            success "Repository cloned successfully"
        else
            error "Failed to clone repository, but continuing..."
        fi
    elif [ ! -d "$repo_path/.git" ]; then
        error "Directory exists but is not a git repository: $repo_path"
        return 1
    else
        echo "Using existing repository at: $repo_path"
    fi

    # Store the configuration
    config_dir="$HOME/.config/outfitting"
    config_file="$config_dir/repo-path"

    mkdir -p "$config_dir"
    chmod 600 "$config_file"

    success "Repository location configured successfully!"

    return 0
}

# Read the configured local outfitting clone path
get_outfitting_repo() {
    local config_file="$HOME/.config/outfitting/repo-path"
    if [ ! -f "$config_file" ]; then
        error "Repository location is not configured."
        return 1
    fi

    cat "$config_file"
}

# Make newly installed package managers available in the current shell
configure_package_manager_paths() {
    if [ -x "/opt/homebrew/bin/brew" ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x "/usr/local/bin/brew" ]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
}

install_homebrew() {
    info "Installing Homebrew..."

    if command -v brew >/dev/null 2>&1 || [ -x "/opt/homebrew/bin/brew" ] || [ -x "/usr/local/bin/brew" ]; then
        configure_package_manager_paths
        success "Homebrew is already installed ($(brew --version | head -1))"
        return 0
    fi

    if NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; then
        configure_package_manager_paths
        if command -v brew >/dev/null 2>&1; then
        else
            warning "Homebrew installer completed, but brew is not in PATH yet"
        fi
    else
        error "Failed to install Homebrew"
        return 1
    fi
}

install_homebrew_packages() {
    info "Installing Homebrew packages..."

    if ! command -v brew >/dev/null 2>&1; then
        error "Homebrew is not available in PATH"
        return 1
    fi

    local repo_path
    repo_path=$(get_outfitting_repo) || return 1

    local brewfile="$repo_path/packages/aarch64-darwin/Brewfile"
    if [ ! -f "$brewfile" ]; then
        error "Homebrew manifest not found: $brewfile"
        return 1
    fi

    if brew bundle --file="$brewfile"; then
        success "Homebrew packages installed from $brewfile"
    else
        error "Failed to install Homebrew packages from $brewfile"
        return 1
    fi
}

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
    else
        warning "Failed to install Bun (network error or already installed)"
        # Try to source it anyway in case it's already there
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
    fi
}

install_astral_uv() {
    info "Installing UV..."

    # Check if already installed
    if command -v uv &> /dev/null; then
        success "UV is already installed ($(uv --version 2>/dev/null))"
        return 0
    fi

    if curl -fsSL https://astral.sh/uv/install.sh 2>/dev/null | bash; then
        if [ -d "$HOME/.local/bin" ] && [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
            export PATH="$HOME/.local/bin:$PATH"
        fi
    else
        warning "Failed to install UV (network error or already installed)"
    fi
}

install_fontget() {
   if ! command -v tailscale >/dev/null 2>&1; then
	   info "Installing Tailscale"
	   curl -fsSL https://raw.githubusercontent.com/Graphixa/FontGet/main/scripts/install.sh | sh
   fi
}


# Post-installation instructions
post_install_info() {
    local repo_path
    repo_path=$(get_outfitting_repo 2>/dev/null || true)

    echo ""
    success "Installation Complete"
    echo ""
}

# Main installation flow
main() {
    echo ""
    echo "macOS Installation"
    echo ""

    check_macos
    check_architecture

    configure_outfitting_repo

    install_homebrew
    install_homebrew_packages

    install_bun
    install_astral_uv

    install_fontget

    post_install_info
}

main # Run main function
