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
    echo "======================================"
    echo "Repository Configuration"
    echo "======================================"
    echo ""

    # Always use default location for remote installation
    repo_path="$HOME/.config/outfitting/repo"
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

    local zerobrew_bin="${ZEROBREW_BIN:-$HOME/.local/bin}"
    if [ -d "$zerobrew_bin" ] && [[ ":$PATH:" != *":$zerobrew_bin:"* ]]; then
        export PATH="$zerobrew_bin:$PATH"
    fi
}

# Install Homebrew via official installer
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
            success "Homebrew installed successfully ($(brew --version | head -1))"
        else
            warning "Homebrew installer completed, but brew is not in PATH yet"
        fi
    else
        error "Failed to install Homebrew"
        return 1
    fi
}

# Install Homebrew casks from the repo Brewfile
install_homebrew_casks() {
    info "Installing Homebrew casks..."

    if ! command -v brew >/dev/null 2>&1; then
        error "Homebrew is not available in PATH"
        return 1
    fi

    local repo_path
    repo_path=$(get_outfitting_repo) || return 1

    local brewfile="$repo_path/packages/aarch64-darwin/Brewfile"
    if [ ! -f "$brewfile" ]; then
        error "Homebrew cask manifest not found: $brewfile"
        return 1
    fi

    if brew bundle --file="$brewfile"; then
        success "Homebrew casks installed from $brewfile"
    else
        error "Failed to install Homebrew casks from $brewfile"
        return 1
    fi
}

# Install ZeroBrew packages from the repo ZeroBrewfile
install_zerobrew_packages() {
    info "Installing ZeroBrew packages..."

    if ! command -v zb >/dev/null 2>&1; then
        error "ZeroBrew is not available in PATH"
        return 1
    fi

    local repo_path
    repo_path=$(get_outfitting_repo) || return 1

    local zerobrewfile="$repo_path/packages/aarch64-darwin/ZeroBrewfile"
    if [ ! -f "$zerobrewfile" ]; then
        error "ZeroBrew package manifest not found: $zerobrewfile"
        return 1
    fi

    if zb bundle install -f "$zerobrewfile"; then
        success "ZeroBrew packages installed from $zerobrewfile"
    else
        error "Failed to install ZeroBrew packages from $zerobrewfile"
        return 1
    fi
}

# Install ZeroBrew via official installer
install_zerobrew() {
    info "Installing zerobrew..."

    if [ -x "${ZEROBREW_BIN:-$HOME/.local/bin}/zb" ] || command -v zb >/dev/null 2>&1; then
        configure_package_manager_paths
        success "zerobrew is already installed ($(zb --version 2>/dev/null | head -1))"
        return 0
    fi

    if curl -fsSL https://zerobrew.rs/install | bash; then
        configure_package_manager_paths
        if command -v zb >/dev/null 2>&1; then
            success "ZeroBrew installed successfully ($(zb --version 2>/dev/null | head -1))"
        else
            warning "zerobrew installer completed, but zb is not in PATH yet"
        fi
    else
        error "Failed to install zerobrew"
        return 1
    fi
}

# Install Bun via official installer
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
        success "Bun installed successfully"
    else
        warning "Failed to install Bun (network error or already installed)"
        # Try to source it anyway in case it's already there
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
    fi
}

# Install Bun global packages from bun.txt
install_bun_packages() {
    info "Installing Bun global packages..."

    if ! command -v bun >/dev/null 2>&1; then
        warning "Bun not found in PATH, skipping global package installations"
        return 0
    fi

    local bunPackagesUrl="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/bun.txt"
    local bunPackagesFile="/tmp/bun-packages.txt"

    if ! curl -fsSL "$bunPackagesUrl" -o "$bunPackagesFile" 2>/dev/null; then
        warning "Failed to fetch Bun packages list (network error), skipping"
        return 0
    fi

    # Validate that the file is not empty
    if [ ! -s "$bunPackagesFile" ]; then
        warning "Bun package list is empty"
        rm -f "$bunPackagesFile"
        return 0
    fi

    local installed=0
    local failed=0
    while IFS= read -r package; do
        # Skip empty lines and comments
        [[ -z "$package" || "$package" =~ ^[[:space:]]*# ]] && continue
        # Remove leading/trailing whitespace
        package=$(echo "$package" | xargs)
        if [[ -n "$package" ]]; then
            # Check if already installed (idempotent)
            if bun pm ls -g 2>/dev/null | grep -q "^$package@"; then
                info "Package already installed: $package"
                ((installed++))
            else
                info "Installing Bun package: $package"
                if bun install -g --trust "$package" 2>/dev/null; then
                    ((installed++))
                else
                    warning "Failed to install: $package"
                    ((failed++))
                fi
            fi
        fi
    done < "$bunPackagesFile"
    rm -f "$bunPackagesFile"

    if [[ $installed -gt 0 ]]; then
        success "Bun packages: $installed installed/verified"
    fi
    if [[ $failed -gt 0 ]]; then
        warning "Bun packages: $failed failed"
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
        success "UV installed"
    else
        warning "Failed to install UV (network error or already installed)"
    fi
}

# Post-installation instructions
post_install_info() {
    local repo_path
    repo_path=$(get_outfitting_repo 2>/dev/null || true)

    echo ""
    echo "======================================"
    echo "Installation Complete!"
    echo "======================================"
    echo ""
    echo "Homebrew: $(command -v brew 2>/dev/null || echo 'not found in PATH')"
    echo "ZeroBrew: $(command -v zb 2>/dev/null || echo 'not found in PATH')"
    if [ -n "$repo_path" ]; then
        echo "Homebrew casks: $repo_path/packages/aarch64-darwin/Brewfile"
        echo "ZeroBrew manifest: $repo_path/packages/aarch64-darwin/ZeroBrewfile"
    fi
    echo "Restart your shell if newly installed commands are not available yet."
    echo ""
}

# Main installation flow
main() {
    echo ""
    echo "======================================"
    echo "macOS Installation"
    echo "======================================"
    echo ""

    check_macos
    check_architecture

    # Step 1: Configure repository
    configure_outfitting_repo

    # Step 2: Install Homebrew
    install_homebrew

    # Step 3: Install Homebrew casks
    install_homebrew_casks

    # Step 4: Install ZeroBrew
    install_zerobrew

    # Step 5: Install ZeroBrew packages
    install_zerobrew_packages

    # Step 6: Install Bun
    install_bun

    # Step 7: Install UV
    install_astral_uv

    # Step 8: Install Bun packages
    install_bun_packages

    post_install_info
}

# Run main function
main
