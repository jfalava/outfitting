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
    if command -v outfitting-manager >/dev/null 2>&1; then
        success "outfitting-manager is already installed"
        return 0
    fi

    local arch asset release_base install_dir temp_dir
    arch=$(uname -m)
    if [[ "$arch" != "arm64" ]]; then
        error "No outfitting-manager release binary is available for macOS architecture: $arch"
        return 1
    fi

    asset="outfitting-manager-darwin-arm64"
    release_base="https://github.com/jfalava/outfitting/releases/latest/download"
    install_dir="$HOME/.local/bin"
    temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/outfitting-manager.XXXXXX")

    info "Installing the latest outfitting-manager release..."
    if ! curl -fL "$release_base/$asset" -o "$temp_dir/$asset"; then
        error "Failed to download outfitting-manager"
        rmdir "$temp_dir"
        return 1
    fi
    if ! curl -fL "$release_base/$asset.sha256" -o "$temp_dir/$asset.sha256"; then
        error "Failed to download outfitting-manager checksum"
        rm -f "$temp_dir/$asset"
        rmdir "$temp_dir"
        return 1
    fi
    if ! (cd "$temp_dir" && shasum -a 256 -c "$asset.sha256"); then
        error "outfitting-manager checksum verification failed"
        rm -f "$temp_dir/$asset" "$temp_dir/$asset.sha256"
        rmdir "$temp_dir"
        return 1
    fi

    if ! mkdir -p "$install_dir"; then
        error "Failed to create outfitting-manager install directory: $install_dir"
        rm -f "$temp_dir/$asset" "$temp_dir/$asset.sha256"
        rmdir "$temp_dir"
        return 1
    fi
    if ! install -m 755 "$temp_dir/$asset" "$install_dir/outfitting-manager"; then
        error "Failed to install outfitting-manager to $install_dir"
        rm -f "$temp_dir/$asset" "$temp_dir/$asset.sha256"
        rmdir "$temp_dir"
        return 1
    fi
    rm -f "$temp_dir/$asset" "$temp_dir/$asset.sha256"
    rmdir "$temp_dir"
    export PATH="$install_dir:$PATH"

    success "outfitting-manager installed"
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

    if ! command -v outfitting-manager >/dev/null 2>&1; then
        error "outfitting-manager is required to retrieve the remote Nix lock"
        return 1
    fi

    local repo_path flake_path lock_dir_display lock_dir lock_path
    repo_path=$(cat "$config_file")
    flake_path="$repo_path/packages/aarch64-darwin"
    lock_dir_display=$(mktemp -d "${TMPDIR:-/tmp}/outfitting-nix-lock.XXXXXX")
    lock_dir=$(cd "$lock_dir_display" && pwd -P)
    lock_path="$lock_dir/flake.lock"

    if ! outfitting-manager lockfiles pull jfalava:aarch64-darwin nix "$lock_path"; then
        error "Failed to retrieve the canonical Nix lock"
        rm -f "$lock_path"
        rmdir "$lock_dir"
        return 1
    fi

    info "Building nix-darwin with the canonical remote lock..."
    local system_config
    if ! system_config=$(
        OUTFITTING_REPO="$repo_path" env -u NIX_PATH nix build \
            --no-link --print-out-paths --impure \
            --reference-lock-file "$lock_path" --no-write-lock-file \
            "path:$flake_path#darwinConfigurations.macos.system"
    ); then
        error "Failed to build nix-darwin"
        rm -f "$lock_path"
        rmdir "$lock_dir"
        return 1
    fi

    info "Activating nix-darwin..."
    # sudo -H is required on macOS to avoid /Users/<user> ownership warnings
    if ! sudo -H HOME=/var/root env -u SUDO_HOME -u NIX_PATH \
        nix-env -p /nix/var/nix/profiles/system --set "$system_config"; then
        error "Failed to update the nix-darwin system profile"
        rm -f "$lock_path"
        rmdir "$lock_dir"
        return 1
    fi
    if ! sudo -H HOME=/var/root env -u SUDO_HOME -u NIX_PATH SUDO_USER="$USER" \
        "$system_config/sw/bin/darwin-rebuild" activate; then
        error "Failed to activate nix-darwin"
        rm -f "$lock_path"
        rmdir "$lock_dir"
        return 1
    fi
    success "nix-darwin activated"

    rm -f "$lock_path"
    rmdir "$lock_dir"
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
    install_outfitting_manager || exit 1

    if [ ! -f "$HOME/.config/outfitting/repo-path" ]; then
        info "Retrying repository setup now that Nix is installed..."
        configure_outfitting_repo
    fi

    install_homebrew
    install_homebrew_packages

    install_nix
    setup_symlinks
    install_nix_darwin

    install_astral_uv

    install_fontget

    post_install_info
}
main # Run main function
#############################################
