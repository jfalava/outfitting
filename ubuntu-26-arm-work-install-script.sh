#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_PATH="$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}❖${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

ensure_target_platform() {
    if [[ ! -r /etc/os-release ]]; then
        error "Cannot read /etc/os-release"
        exit 1
    fi

    # shellcheck source=/dev/null
    source /etc/os-release

    if [[ "${ID:-}" != "ubuntu" ]]; then
        error "This script only supports Ubuntu 26.04 ARM (detected: ${ID:-unknown})"
        exit 1
    fi

    if [[ "${VERSION_ID:-}" != "26.04" ]]; then
        error "This script requires Ubuntu 26.04 (detected: ${VERSION_ID:-unknown})"
        exit 1
    fi

    local arch
    arch="$(dpkg --print-architecture)"
    if [[ "$arch" != "arm64" ]]; then
        error "This script requires ARM64 (detected: $arch)"
        exit 1
    fi

    success "Detected Ubuntu 26.04 on ARM64"
}

ensure_core_tools() {
    if ! command -v sudo >/dev/null 2>&1; then
        error "sudo is required"
        exit 1
    fi

    sudo apt update -y
    sudo apt install -y curl ca-certificates gpg lsb-release
}

install_apt_packages() {
    local apt_file="$REPO_PATH/packages/aarch64-linux/apt.txt"
    if [[ ! -f "$apt_file" ]]; then
        error "APT package list not found: $apt_file"
        exit 1
    fi

    info "Installing APT packages for ARM Linux..."
    local installed=0
    local failed=0
    local failed_packages=""

    while IFS= read -r package || [[ -n "$package" ]]; do
        package="$(echo "$package" | tr -d '[:space:]')"
        [[ -z "$package" || "$package" =~ ^# ]] && continue
        info "Installing: $package"
        if sudo apt install -y "$package"; then
            ((++installed))
        else
            ((++failed))
            failed_packages="$failed_packages $package"
        fi
    done < "$apt_file"

    sudo apt autoremove -y

    if [[ $failed -gt 0 ]]; then
        warning "APT packages: $installed installed, $failed failed:$failed_packages"
    else
        success "APT packages: $installed installed"
    fi
}

setup_hashicorp_repo() {
    info "Setting up HashiCorp repository..."
    if [[ ! -f /usr/share/keyrings/hashicorp-archive-keyring.gpg ]]; then
        wget -qO- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
    fi

    # shellcheck disable=SC1091
    source /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com ${UBUNTU_CODENAME:-$VERSION_CODENAME} main" | sudo tee /etc/apt/sources.list.d/hashicorp.list > /dev/null
    sudo apt update -y
    success "HashiCorp repository configured"
}

install_nix() {
    if command -v nix >/dev/null 2>&1; then
        success "Nix already installed"
        return 0
    fi

    info "Installing Nix..."
    curl --proto '=https' --tlsv1.2 -sSf -L https://nixos.org/nix/install | sh -s -- --daemon

    # shellcheck source=/dev/null
    source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh 2>/dev/null || true

    sudo mkdir -p /etc/nix
    sudo tee /etc/nix/nix.conf > /dev/null << 'EOF'
substituters = https://cache.nixos.org/ https://nix-community.cachix.org
trusted-public-keys = cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY= nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs=
trusted-users = root @sudo
auto-optimise-store = true
max-jobs = auto
experimental-features = nix-command flakes
EOF

    success "Nix installed"
}

setup_symlinks() {
    local hm_target="$REPO_PATH/packages/aarch64-linux"

    mkdir -p "$HOME/.config"
    ln -sfn "$hm_target" "$HOME/.config/home-manager"
    success "Symlink configured: ~/.config/home-manager -> $hm_target"
}

install_home_manager() {
    local flake_path="$REPO_PATH/packages/aarch64-linux"

    info "Applying Home Manager profile..."
    nix run home-manager/master -- switch --flake "$flake_path#jalava" --impure
    success "Home Manager applied"
}

install_runtimes() {
    if ! command -v bun >/dev/null 2>&1; then
        info "Installing Bun..."
        curl -fsSL https://bun.sh/install | bash
    fi

    if ! command -v uv >/dev/null 2>&1; then
        info "Installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
    fi
}

set_default_shell_zsh() {
    if ! command -v zsh >/dev/null 2>&1; then
        warning "zsh not found, skipping default shell change"
        return 0
    fi

    local zsh_path
    zsh_path="$(command -v zsh)"
    info "Setting default shell to zsh ($zsh_path)..."
    sudo chsh -s "$zsh_path" "$USER" 2>/dev/null || \
        warning "Could not set zsh as default shell (run: chsh -s $zsh_path)"
}

install_bun_packages() {
    if ! command -v bun >/dev/null 2>&1; then
        warning "Bun not available, skipping global Bun packages"
        return 0
    fi

    local bun_packages_file="$REPO_PATH/packages/bun.txt"
    if [[ ! -s "$bun_packages_file" ]]; then
        warning "Missing Bun package list: $bun_packages_file"
        return 0
    fi

    info "Installing Bun global packages..."
    while IFS= read -r package || [[ -n "$package" ]]; do
        package="$(echo "$package" | xargs)"
        [[ -z "$package" || "$package" =~ ^# ]] && continue
        bun install -g --trust "$package"
    done < "$bun_packages_file"
}

main() {
    info "Ubuntu 26.04 ARM work setup"
    ensure_target_platform
    ensure_core_tools
    install_apt_packages
    setup_hashicorp_repo
    install_nix
    setup_symlinks
    install_home_manager
    install_runtimes
    set_default_shell_zsh
    install_bun_packages
    success "Installation complete"
}

main "$@"
