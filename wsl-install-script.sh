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
    while IFS= read -r package || [[ -n "$package" ]]; do
        package=$(echo "$package" | tr -d '[:space:]')
        [[ -z "$package" || "$package" =~ ^# ]] && continue
        info "Installing: $package"
        sudo apt install -y "$package" 2>/dev/null || warning "Failed: $package"
    done < "$apt_file"

    sudo apt autoremove -y
    rm -f "$apt_file"
    success "APT packages installed"
}

# ========================================
# Repository Configuration
# ========================================
configure_repo() {
    info "Setting up outfitting repository..."

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
trusted-users = root @wheel
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
    export PATH="$HOME/.local/bin:$PATH"

    # Deno Jupyter (via Nix, may not be available yet)
    deno jupyter --install 2>/dev/null || true
}

# ========================================
# Bun Global Packages
# ========================================
install_bun_packages() {
    if ! command -v bun &>/dev/null; then
        warning "Bun not found, skipping global packages"
        return 0
    fi

    info "Installing Bun global packages..."
    local url="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/bun.txt"
    local file="/tmp/bun-packages.txt"

    if ! curl -fsSL "$url" -o "$file" 2>/dev/null; then
        warning "Failed to fetch package list"
        return 0
    fi

    local installed=0 skipped=0
    while IFS= read -r package || [[ -n "$package" ]]; do
        [[ -z "$package" || "$package" =~ ^[[:space:]]*# ]] && continue
        package=$(echo "$package" | xargs)
        [[ -z "$package" ]] && continue

        if bun pm ls -g 2>/dev/null | grep -q "^$package@"; then
            ((skipped++))
        else
            bun install -g "$package" 2>/dev/null && ((installed++)) || warning "Failed: $package"
        fi
    done < "$file"
    rm -f "$file"

    success "Bun packages: $installed installed, $skipped already present"
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

    # Ensure curl is available
    sudo apt install -y curl 2>/dev/null || true

    case "$MODE" in
        apt-only)
            install_apt_packages
            ;;
        full)
            install_apt_packages
            configure_repo
            install_nix
            install_home_manager
            install_runtimes
            install_bun_packages
            install_claude_code
            ;;
        nix|*)
            configure_repo
            install_nix
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
