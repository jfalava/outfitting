#!/bin/bash

# macOS Outfitting Installation Script

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
#############################################

#################### Configure the local repo
configure_outfitting_repo() {
    echo ""
    echo "Repository Configuration"
    echo ""

    # Guard: skip setup if git is not available (e.g. fresh macOS before nix-darwin runs).
    # Nix will install git; the caller should retry after nix-darwin completes.
    if ! command -v git &>/dev/null; then
        warning "git not found — skipping repository setup. Will retry after Nix installation."
        return 0
    fi

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
    # Write the repo path before locking permissions
    echo "$repo_path" > "$config_file"
    chmod 600 "$config_file"

    success "Repository location configured successfully!"

    return 0
}
get_outfitting_repo() {
    local config_file="$HOME/.config/outfitting/repo-path"
    if [ ! -f "$config_file" ]; then
        error "Repository location is not configured."
        return 1
    fi

    cat "$config_file"
}
#############################################

################# Set up the package managers
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
            true
        else
            warning "Homebrew installer completed, but brew is not in PATH yet"
        fi
    else
        error "Failed to install Homebrew"
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
#############################################

############################ Nix Installation
install_nix() {
    if command -v nix &>/dev/null; then
        success "Nix already installed ($(nix --version 2>/dev/null | head -1))"
        return 0
    fi

    info "Installing Nix (Determinate Systems)..."
    if curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install --no-confirm; then
        # Source nix for current session
        # shellcheck source=/dev/null
        source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh 2>/dev/null || true
        success "Nix installed"
    else
        error "Failed to install Nix"
        return 1
    fi
}
#############################################

############################## Setup symlinks
setup_symlinks() {
    info "Setting up Home Manager configuration symlinks..."

    local config_file="$HOME/.config/outfitting/repo-path"
    if [ ! -f "$config_file" ]; then
        error "Repository not configured. Cannot create symlinks."
        return 1
    fi

    local repo_path hm_target
    repo_path=$(cat "$config_file")
    hm_target="$repo_path/packages/aarch64-darwin"

    mkdir -p "$HOME/.config"

    # Backup existing managed dotfiles
    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    local managed_files=(".zshrc")

    for file in "${managed_files[@]}"; do
        if [ -f "$HOME/$file" ] && [ ! -L "$HOME/$file" ]; then
            info "Backing up existing $file to ${file}.backup-${timestamp}"
            mv "$HOME/$file" "$HOME/${file}.backup-${timestamp}"
        fi
    done

    # Create symlink for home-manager config
    if [ ! -L "$HOME/.config/home-manager" ]; then
        info "Creating symlink: ~/.config/home-manager → $hm_target"
        ln -sfn "$hm_target" "$HOME/.config/home-manager"
    else
        success "Symlink already exists: ~/.config/home-manager"
    fi

    success "Symlinks configured!"
    return 0
}
#############################################

##################### nix-darwin Installation
install_nix_darwin() {
    if ! command -v nix &>/dev/null; then
        error "Nix not found, cannot install nix-darwin"
        return 1
    fi

    local config_file="$HOME/.config/outfitting/repo-path"
    if [ ! -f "$config_file" ]; then
        error "Repository not configured"
        return 1
    fi

    local repo_path flake_path
    repo_path=$(cat "$config_file")
    flake_path="$repo_path/packages/aarch64-darwin"

    info "Running nix-darwin switch (darwinConfigurations.macos)..."
    # sudo -H is required on macOS to avoid /Users/<user> ownership warnings
    if sudo -H env -u NIX_PATH nix run nix-darwin -- switch --flake "path:$flake_path#macos" --impure; then
        success "nix-darwin activated"
    else
        error "Failed to activate nix-darwin"
        return 1
    fi
}
#############################################

############################ Install packages
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
install_fontget() {
	if ! command -v fontget >/dev/null 2>&1; then
	   info "Installing FontGet"
	   curl -fsSL https://raw.githubusercontent.com/Graphixa/FontGet/main/scripts/install.sh | sh
   fi
}
#############################################

############## Post-installation instructions
post_install_info() {
    local repo_path
    repo_path=$(get_outfitting_repo 2>/dev/null || true)

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

    configure_outfitting_repo

    if [ ! -f "$HOME/.config/outfitting/repo-path" ]; then
        info "Retrying repository setup now that Nix is installed..."
        configure_outfitting_repo
    fi

    install_homebrew
    install_homebrew_packages

    install_nix
    setup_symlinks
    install_nix_darwin

    install_bun
    install_astral_uv

    install_fontget

    post_install_info
}
main # Run main function
#############################################
