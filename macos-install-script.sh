#!/bin/bash

#############################################
######################## macOS Install Script
#############################################

set -euo pipefail

########################## Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
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
#############################################

############################## Initial checks
check_macos() {
    if [[ "$(uname)" != "Darwin" ]]; then
        error "This script is for macOS only."
        exit 1
    fi
    success "Running on macOS"
}
check_architecture() {
    local arch
    arch=$(uname -m)

    if [[ "$arch" != "arm64" ]]; then
        error "Apple Silicon (arm64) is required"
        exit 1
    fi
    info "Detected Apple Silicon (ARM64)"
}
#############################################

################# Set up the package managers
configure_package_manager_paths() {
    if [ -x "/opt/homebrew/bin/brew" ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
}
install_homebrew() {
    info "Installing Homebrew..."

    if command -v brew >/dev/null 2>&1 || [ -x "/opt/homebrew/bin/brew" ]; then
        configure_package_manager_paths
        success "Homebrew is already installed ($(brew --version | head -1))"
        return 0
    fi

    if NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; then
        configure_package_manager_paths
        if command -v brew >/dev/null 2>&1; then
            true
        else
            warning "Homebrew installer completed, but brew is not in PATH yet"
        fi
    else
        error "Failed to install Homebrew"
        return 1
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

install_outfitting_manager() {
    local asset entry release_base install_dir temp_dir
    asset="outfitting-manager-darwin-arm64.zip"
    entry="outfitting-manager"
    release_base="https://github.com/jfalava/outfitting/releases/latest/download"
    install_dir="$HOME/.local/bin"
    temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/outfitting-manager.XXXXXX")

    info "Installing the latest outfitting-manager release..."
    cleanup_temp() {
        rm -rf "$temp_dir"
    }
    if ! curl -fL "$release_base/$asset" -o "$temp_dir/$asset"; then
        error "Failed to download outfitting-manager"
        cleanup_temp
        return 1
    fi
    if ! curl -fL "$release_base/$asset.sha256" -o "$temp_dir/$asset.sha256"; then
        error "Failed to download outfitting-manager checksum"
        cleanup_temp
        return 1
    fi
    if ! (cd "$temp_dir" && shasum -a 256 -c "$asset.sha256"); then
        error "outfitting-manager checksum verification failed"
        cleanup_temp
        return 1
    fi
    if ! unzip -qo "$temp_dir/$asset" -d "$temp_dir"; then
        error "Failed to extract outfitting-manager archive"
        cleanup_temp
        return 1
    fi
    if [[ ! -f "$temp_dir/$entry" ]]; then
        error "outfitting-manager archive does not contain $entry"
        cleanup_temp
        return 1
    fi

    if ! mkdir -p "$install_dir"; then
        error "Failed to create outfitting-manager install directory: $install_dir"
        cleanup_temp
        return 1
    fi
    if ! install -m 755 "$temp_dir/$entry" "$install_dir/outfitting-manager"; then
        error "Failed to install outfitting-manager to $install_dir"
        cleanup_temp
        return 1
    fi
    # Ad-hoc sign so the binary can access the macOS keychain (Bun.secrets) without being killed (exit 137).
    # Newer Bun versions produce unsigned binaries that are killed on first keychain access, causing silent outfit failures.
    if command -v codesign >/dev/null 2>&1; then
        if ! codesign --force --sign - "$install_dir/outfitting-manager" 2>/dev/null; then
            warning "codesign failed for outfitting-manager — it may be killed on keychain access (exit 137). Run 'codesign --force --sign - $install_dir/outfitting-manager' manually."
        fi
    fi
    cleanup_temp
    export PATH="$install_dir:$PATH"

    success "outfitting-manager installed"
}

run_outfitting_manager() {
    local manager="$HOME/.local/bin/outfitting-manager"
    if [ ! -x "$manager" ]; then
        error "outfitting-manager is not installed at $manager"
        return 1
    fi
    "$manager" "$@"
}
#############################################

############################ Nix Installation
source_nix_environment() {
    local profile nix_bin

    for profile in \
        "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh" \
        "$HOME/.nix-profile/etc/profile.d/nix-daemon.sh" \
        "$HOME/.nix-profile/etc/profile.d/nix.sh"
    do
        if [ -r "$profile" ]; then
            # shellcheck source=/dev/null
            source "$profile"
        fi
    done

    for nix_bin in \
        "/nix/var/nix/profiles/default/bin/nix" \
        "$HOME/.nix-profile/bin/nix" \
        "/run/current-system/sw/bin/nix"
    do
        if [ -x "$nix_bin" ]; then
            export PATH="$(dirname "$nix_bin"):$PATH"
            return 0
        fi
    done

    return 1
}

nix_available() {
    # shellcheck source=/dev/null
    source_nix_environment 2>/dev/null || true
    command -v nix >/dev/null 2>&1
}

install_nix() {
    if nix_available; then
        success "Nix already installed ($(nix --version 2>/dev/null | head -1))"
        return 0
    fi

    if [ -d "/nix" ]; then
        error "A Nix installation already exists, but nix is not available in this shell."
        error "Open a new shell or source the Nix profile before rerunning the installer."
        return 1
    fi

    info "Installing Nix (Determinate Systems)..."
    if curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install --no-confirm; then
        if nix_available; then
            success "Nix installed"
        else
            error "Nix installation completed, but nix is not available in this shell"
            return 1
        fi
    else
        error "Failed to install Nix"
        return 1
    fi
}
#############################################

install_fontget() {
	if ! command -v fontget >/dev/null 2>&1; then
	   info "Installing FontGet"
	   curl -fsSL https://raw.githubusercontent.com/Graphixa/FontGet/main/scripts/install.sh | sh
   fi
}
#############################################

############## Post-installation instructions
post_install_info() {
    echo ""
    success "Installation Complete"
    echo ""
}
#############################################

###################### Main installation flow
main() {
    echo ""
    echo "macOS Installation"
    echo ""

    check_macos
    check_architecture

    install_outfitting_manager || exit 1
    install_homebrew || exit 1
    install_nix || exit 1

    run_outfitting_manager setup || exit 1
    run_outfitting_manager update brew --no-sync || exit 1
    run_outfitting_manager update nix || exit 1

    install_astral_uv

    install_fontget

    post_install_info
}
main # Run main function
#############################################
