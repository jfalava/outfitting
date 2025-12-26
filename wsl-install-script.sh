#!/bin/bash

# ========================================
# WSL Outfitting Installation Script
# ========================================
# Modes:
#   (default)     - Nix + Home Manager only (most common for updates)
#   --full        - Full install: APT packages + Nix + runtimes
#   --apt-only    - APT packages only (skip Nix)
# Profiles:
#   --work        - Use work profile (extends personal with work tools)
#   --personal    - Use personal profile (default)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
info() { echo -e "${BLUE}❖${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

# Configuration
MODE="nix"  # nix (default), full, apt-only
PROFILE="personal"

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --full|--full-install) MODE="full" ;;
        --apt-only|--update-only) MODE="apt-only" ;;
        --nix|--nix-only) MODE="nix" ;;
        --work|--work-profile) PROFILE="work" ;;
        --personal|--personal-profile) PROFILE="personal" ;;
    esac
done

info "Mode: $MODE | Profile: $PROFILE"

# ========================================
# APT Package Installation
# ========================================
install_apt_packages() {
    info "Updating APT and installing packages..."
    sudo apt update -y && sudo apt upgrade -y

    local apt_url="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-linux/apt.txt"
    local apt_file="/tmp/apt-packages.txt"

    if ! curl -fsSL "$apt_url" -o "$apt_file"; then
        error "Failed to fetch APT package list"
        return 1
    fi

    # Install packages (skip comments and empty lines)
    local installed=0 failed=0 failed_packages=""
    while IFS= read -r package || [[ -n "$package" ]]; do
        package=$(echo "$package" | tr -d '[:space:]')
        [[ -z "$package" || "$package" =~ ^# ]] && continue
        info "Installing: $package"
        if sudo apt install -y "$package"; then
            ((installed++))
        else
            ((failed++))
            failed_packages="$failed_packages $package"
        fi
    done < "$apt_file"

    sudo apt autoremove -y
    rm -f "$apt_file"

    if [[ $failed -gt 0 ]]; then
        warning "APT packages: $installed installed, $failed failed:$failed_packages"
    else
        success "APT packages: $installed installed"
    fi
}

# ========================================
# HashiCorp Repository Setup
# ========================================
setup_hashicorp_repo() {
    info "Setting up HashiCorp repository..."

    if grep -q hashicorp /etc/apt/sources.list.d/hashicorp.list 2>/dev/null; then
        success "HashiCorp repository already configured"
        return 0
    fi

    if ! wget -qO- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg; then
        error "Failed to download HashiCorp GPG key"
        return 1
    fi

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list > /dev/null
    sudo apt update -y
    success "HashiCorp repository configured"
}

# ========================================
# Docker Repository Setup and Installation
# ========================================
setup_docker() {
    info "Setting up Docker repository and installing Docker..."

    # Remove conflicting packages
    for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
        sudo apt remove -y "$pkg" 2>/dev/null || true
    done

    # Install required packages
    sudo apt install -y ca-certificates || {
        error "Failed to install ca-certificates"
        return 1
    }

    # Setup Docker repository
    sudo install -m 0755 -d /etc/apt/keyrings || {
        error "Failed to create keyrings directory"
        return 1
    }

    if ! sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc; then
        error "Failed to download Docker GPG key"
        return 1
    fi

    sudo chmod a+r /etc/apt/keyrings/docker.asc

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt update -y

    if ! sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; then
        error "Failed to install Docker packages"
        return 1
    fi

    success "Docker installed successfully"
}

# ========================================
# Repository Configuration
# ========================================
configure_repo() {
    info "Setting up outfitting repository..."

    # Ensure git is available
    if ! command -v git &>/dev/null; then
        info "Installing git..."
        sudo apt install -y git || {
            error "Failed to install git"
            return 1
        }
    fi

    local repo_path="$HOME/.config/outfitting/repo"
    local config_dir="$HOME/.config/outfitting"
    local config_file="$config_dir/repo-path"

    if [ -d "$repo_path/.git" ]; then
        success "Repository exists at: $repo_path"
    elif [ -d "$repo_path" ]; then
        error "Directory exists but is not a git repo: $repo_path"
        return 1
    else
        info "Cloning repository..."
        mkdir -p "$(dirname "$repo_path")"
        if git clone https://github.com/jfalava/outfitting.git "$repo_path"; then
            success "Repository cloned"
        else
            error "Failed to clone repository"
            return 1
        fi
    fi

    mkdir -p "$config_dir"
    echo "$repo_path" > "$config_file"
    chmod 600 "$config_file"

    echo "✓ Repository location configured successfully!"
    return 0
}

# Call the configuration function
configure_repo

echo ""

if [[ "$MODE" != "update-only" ]]; then

#####
## Setup symlinks and backup existing dotfiles
#####
setup_symlinks() {
    echo "❖ Setting up Home Manager configuration symlinks and backing up existing dotfiles..."

    config_file="$HOME/.config/outfitting/repo-path"
    if [ ! -f "$config_file" ]; then
        echo "❖ Error: Repository not configured. Cannot create symlinks."
        return 1
    fi

    repo_path=$(cat "$config_file")
    hm_target="$repo_path/packages/x64-linux"

    # Create ~/.config directory if it doesn't exist
    mkdir -p "$HOME/.config"

    # Backup existing managed files before creating symlinks
    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)

    # List of files/directories that Home Manager will manage
    local managed_files=(".zshrc" ".zshrc-base")
    local managed_dirs=(".config")

    # Backup files
    for file in "${managed_files[@]}"; do
        if [ -f "$HOME/$file" ] && [ ! -L "$HOME/$file" ]; then
            echo "❖ Backing up existing $file to ${file}.backup-${timestamp}"
            mv "$HOME/$file" "$HOME/${file}.backup-${timestamp}"
        fi
    done

    # Backup directories (but not if it's already a symlink)
    for dir in "${managed_dirs[@]}"; do
        if [ -d "$HOME/$dir" ] && [ ! -L "$HOME/$dir" ]; then
            # Only backup .config if it doesn't contain the home-manager symlink
            if [ -L "$HOME/$dir/home-manager" ]; then
                echo "❖ Removing old home-manager symlink from $dir"
                rm -f "$HOME/$dir/home-manager"
            fi
        fi
    done

    # Create symlink for home-manager
    if [ ! -L "$HOME/.config/home-manager" ]; then
        echo "❖ Creating symlink: ~/.config/home-manager → $hm_target"
        ln -sfn "$hm_target" "$HOME/.config/home-manager"
    else
        echo "✓ Symlink already exists: ~/.config/home-manager"
    fi

    echo "✓ Symlinks created and backups completed!"
    return 0
}

#####
## nix
#####
curl --proto '=https' --tlsv1.2 -sSf -L https://nixos.org/nix/install | sh -s -- --daemon || {
    echo "❖ Failed to install Nix. Exiting..."
    exit 1
}

# ========================================
# Nix Installation
# ========================================
install_nix() {
    if command -v nix &>/dev/null; then
        success "Nix already installed ($(nix --version 2>/dev/null | head -1))"
        return 0
    fi

    info "Installing Nix..."
    curl --proto '=https' --tlsv1.2 -sSf -L https://nixos.org/nix/install | sh -s -- --daemon || {
        error "Failed to install Nix"
        return 1
    }

    # Source nix for current session
    # shellcheck source=/dev/null
    source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh 2>/dev/null || \
        source ~/.nix-profile/etc/profile.d/nix.sh 2>/dev/null || true

    # Configure Nix
    sudo mkdir -p /etc/nix
    sudo tee /etc/nix/nix.conf > /dev/null << 'EOF'
substituters = https://cache.nixos.org/ https://nix-community.cachix.org
trusted-public-keys = cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY= nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs=
trusted-users = root @sudo
auto-optimise-store = true
max-jobs = auto
experimental-features = nix-command flakes
EOF

    success "Nix installed with flakes enabled"
}

# ========================================
# Home Manager Installation
# ========================================
install_home_manager() {
    if ! command -v nix &>/dev/null; then
        error "Nix not found, cannot install Home Manager"
        return 1
    fi

    local config_file="$HOME/.config/outfitting/repo-path"
    if [ ! -f "$config_file" ]; then
        error "Repository not configured"
        return 1
    fi

    local repo_path flake_path hm_config
    repo_path=$(cat "$config_file")
    flake_path="$repo_path/packages/x64-linux"

    if [ "$PROFILE" = "work" ]; then
        hm_config="jfalava-work"
        info "Installing Home Manager (work profile)..."
    else
        hm_config="jfalava-personal"
        info "Installing Home Manager (personal profile)..."
    fi

    # Use --impure for absolute path dotfile access
    if ! nix run home-manager/master -- switch --flake "$flake_path#$hm_config" --impure; then
        if [ "$PROFILE" = "work" ]; then
            warning "Work profile failed, trying personal..."
            nix run home-manager/master -- switch --flake "$flake_path#jfalava-personal" --impure
        else
            error "Failed to install Home Manager"
            return 1
        fi
    fi

    success "Home Manager configured ($hm_config)"

    # Set zsh as default shell
    if command -v zsh &>/dev/null; then
        info "Setting zsh as default shell..."
        sudo chsh -s "$(which zsh)" "$USER" 2>/dev/null || \
            warning "Could not set zsh as default (run: chsh -s \$(which zsh))"
    fi
}

# ========================================
# Runtime Installation (Bun, uv, etc.)
# ========================================
install_runtimes() {
    # Bun
    if command -v bun &>/dev/null; then
        success "Bun already installed ($(bun --version 2>/dev/null))"
    else
        info "Installing Bun..."
        curl -fsSL https://bun.sh/install | bash
    fi
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    # uv (Python package manager)
    if command -v uv &>/dev/null; then
        success "uv already installed"
    else
        info "Installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
    fi
else
    echo "❖ Nix not found, skipping home-manager installation"
fi
fi
fi

if [[ "$MODE" != "update-only" ]]; then
#####
## runtimes
#####

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Source Bun in current session
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Install Deno (via Nix, already in PATH from Home Manager)
deno jupyter --install 2>/dev/null || echo "Note: Deno jupyter install skipped (deno may not be available yet)"

# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Source uv in current session
export PATH="$HOME/.local/share/uv/bin:$PATH"

# ========================================
# Bun Global Packages
# ========================================
install_bun_packages() {
    info "Installing Bun global packages..."

    if ! command -v bun >/dev/null 2>&1; then
        echo "❖ Bun not found, skipping global package installations"
        return 0
    fi

    local bunPackagesUrl="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/bun.txt"
    local bunPackagesFile="/tmp/bun-packages.txt"

    if ! curl -fsSL "$bunPackagesUrl" -o "$bunPackagesFile" 2>/dev/null; then
        echo "❖ Warning: Failed to fetch Bun packages list, skipping"
        return 0
    fi

    # Validate file is not empty and remove if empty
    if [ ! -s "$bunPackagesFile" ]; then
        rm -f "$bunPackagesFile"
        echo "❖ Warning: Bun packages file is empty, skipping"
        return 0
    fi

    local installed=0
    local failed=0
    while IFS= read -r package || [[ -n "$package" ]]; do
        # Skip empty lines and comments
        [[ -z "$package" || "$package" =~ ^[[:space:]]*# ]] && continue
        # Remove leading/trailing whitespace
        package=$(echo "$package" | xargs)
        if [[ -n "$package" ]]; then
            # Check existing global packages via bun pm ls -g
            if bun pm ls -g 2>/dev/null | grep -q "^$package@"; then
                info "Package already installed: $package"
                ((installed++))
            else
                info "Installing Bun package: $package"
                if bun install -g "$package" 2>/dev/null; then
                    ((installed++))
                else
                    echo "❖ Warning: Failed to install: $package"
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
        echo "❖ Warning: Bun packages: $failed failed"
    fi
}

# ========================================
# Claude Code
# ========================================
install_claude_code() {
    if command -v claude &>/dev/null; then
        success "Claude Code already installed"
        return 0
    fi

    info "Installing Claude Code..."
    curl -fsSL https://claude.ai/install.sh | bash
}

# ========================================
# Main
# ========================================
main() {
    echo ""
    info "WSL Outfitting Setup"
    echo ""

    # Ensure curl is available (required for all modes)
    if ! command -v curl &>/dev/null; then
        info "Installing curl..."
        sudo apt update -y
        sudo apt install -y curl || {
            error "Failed to install curl (required)"
            exit 1
        }
    fi

    case "$MODE" in
        apt-only)
            install_apt_packages
            setup_hashicorp_repo
            setup_docker
            ;;
        full)
            install_apt_packages
            setup_hashicorp_repo
            setup_docker
            configure_repo
            install_nix
            setup_symlinks
            install_home_manager
            install_runtimes
            install_bun_packages
            install_claude_code
            ;;
        nix|*)
            configure_repo
            install_nix
            setup_symlinks
            install_home_manager
            install_runtimes
            install_bun_packages
            install_claude_code
            ;;
    esac

    echo ""
    success "Installation complete!"
    echo ""
    info "Update commands (after opening a new terminal):"
    echo "  hm-update    - Update Nix packages and Home Manager"
    echo "  hm-personal  - Switch to personal profile"
    echo "  hm-work      - Switch to work profile"
    echo ""
}

main
