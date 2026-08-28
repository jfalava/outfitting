#!/bin/bash

#############################################
######################### NixOS Install Script
#############################################
# Modes: --server (default, headless) and --desktop/--gui (workstation)
# Usage:
#   curl -L nixos.jfa.dev | bash                     # server (default)
#   curl -L nixos.jfa.dev | bash -s -- --desktop     # desktop with GNOME
#   curl -L nixos.jfa.dev | bash -s -- --server --hostname srv1
#   curl -L nixos.jfa.dev | bash -s -- --help
#############################################

set -euo pipefail

############################### Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
info() { echo -e "${BLUE}❖${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }
#################################################

################################### Configuration
MODE="server"   # server | desktop
HOSTNAME=""
REPO_PATH="${HOME}/.config/outfitting/repo"
FLAKE_TARGET=""  # derived from MODE if empty
ASSUME_YES=false
SSH_KEY=""
#################################################

usage() {
    cat <<'EOF'
NixOS Outfitting Installer

Usage: nixos-install-script.sh [OPTIONS]

Modes (pick one, default: --server):
  --server, --headless          Minimal headless server (no GUI, SSH + Docker)
  --desktop, --gui, --workstation
                                Workstation with GNOME, graphical apps

Options:
  --hostname <name>             Hostname for nixosConfigurations.<name> (default: nixos or nixos-desktop)
  --flake <target>              Override flake target (e.g. desktop, server, nixos)
  --repo <path>                 Override outfitting repo path (default: ~/.config/outfitting/repo)
  --ssh-key <key-or-url>        Append SSH authorized key (or fetch URL) for jfalava
  -y, --yes                     Assume yes (non-interactive)
  -h, --help                    Show this help

Examples:
  curl -L nixos.jfa.dev | bash
  curl -L nixos.jfa.dev | bash -s -- --desktop
  curl -L nixos.jfa.dev | bash -s -- --server --hostname srv1
  curl -L nixos.jfa.dev | bash -s -- --gui --hostname thinkpad
EOF
}

########## Parse arguments for the install script
while [[ $# -gt 0 ]]; do
    case "$1" in
        --server|--headless)
            MODE="server"
            shift
            ;;
        --desktop|--gui|--workstation)
            MODE="desktop"
            shift
            ;;
        --hostname)
            HOSTNAME="${2:-}"
            if [[ -z "$HOSTNAME" ]]; then error "--hostname requires a value"; exit 1; fi
            shift 2
            ;;
        --flake)
            FLAKE_TARGET="${2:-}"
            if [[ -z "$FLAKE_TARGET" ]]; then error "--flake requires a value"; exit 1; fi
            shift 2
            ;;
        --repo)
            REPO_PATH="${2:-}"
            if [[ -z "$REPO_PATH" ]]; then error "--repo requires a value"; exit 1; fi
            shift 2
            ;;
        --ssh-key)
            SSH_KEY="${2:-}"
            if [[ -z "$SSH_KEY" ]]; then error "--ssh-key requires a value"; exit 1; fi
            shift 2
            ;;
        -y|--yes|--assume-yes)
            ASSUME_YES=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        --)
            shift
            break
            ;;
        *)
            error "Unknown option: $1 (see --help)"
            exit 1
            ;;
    esac
done

# Derive defaults
if [[ -z "$FLAKE_TARGET" ]]; then
    if [[ -n "$HOSTNAME" ]]; then
        FLAKE_TARGET="$HOSTNAME"
    elif [[ "$MODE" == "desktop" ]]; then
        FLAKE_TARGET="desktop"
    else
        FLAKE_TARGET="server"
    fi
fi
if [[ -z "$HOSTNAME" ]]; then
    if [[ "$FLAKE_TARGET" == "server" || "$FLAKE_TARGET" == "desktop" ]]; then
        HOSTNAME="nixos"
    else
        HOSTNAME="$FLAKE_TARGET"
    fi
fi

info "Mode: $MODE"
info "Flake target: $FLAKE_TARGET"
info "Hostname: $HOSTNAME"
info "Repo: $REPO_PATH"
#################################################

############################## Initial checks
check_nixos() {
    if [[ -f /etc/NIXOS ]] || command -v nixos-version &>/dev/null || [[ -f /etc/nixos/configuration.nix ]]; then
        success "Running on NixOS ($(nixos-version 2>/dev/null || echo "detected"))"
        return 0
    fi
    warning "This script is intended for NixOS."
    warning "Not detected as NixOS (no /etc/NIXOS, no nixos-version)."
    if [[ "$ASSUME_YES" == true ]]; then
        warning "Continuing anyway (--yes)"
        return 0
    fi
    echo -n "Continue anyway? [y/N] "
    read -r ans
    if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
        error "Aborted. Run this from a NixOS system or live ISO."
        exit 1
    fi
}

ensure_root_hint() {
    if [[ "$EUID" -eq 0 ]]; then
        error "Do not run as root. Run as jfalava; the script will sudo when needed."
        exit 1
    fi
}
#################################################

#################### Configure the local repo
configure_repo() {
    info "Setting up outfitting repository..."

    if ! command -v git &>/dev/null; then
        info "git not found, installing via nix..."
        if command -v nix &>/dev/null; then
            nix --extra-experimental-features "nix-command flakes" shell nixpkgs#git --command true 2>/dev/null || true
        fi
        if ! command -v git &>/dev/null; then
            # Fallback: use system nix-env or install git via nix profile
            if command -v nix-env &>/dev/null; then
                nix-env -iA nixpkgs.git 2>/dev/null || true
            fi
        fi
        if ! command -v git &>/dev/null; then
            error "git is required to clone outfitting. Install git and retry."
            return 1
        fi
    fi

    local config_dir config_file
    config_dir="$HOME/.config/outfitting"
    config_file="$config_dir/repo-path"

    if [ -d "$REPO_PATH/.git" ]; then
        success "Repository exists at: $REPO_PATH"
        if command -v git &>/dev/null; then
            info "Updating repository..."
            git -C "$REPO_PATH" pull --ff-only 2>/dev/null || warning "Could not git pull (offline or dirty)"
        fi
    elif [ -d "$REPO_PATH" ]; then
        error "Directory exists but is not a git repo: $REPO_PATH"
        return 1
    else
        info "Cloning repository to $REPO_PATH..."
        mkdir -p "$(dirname "$REPO_PATH")"
        if git clone https://github.com/jfalava/outfitting.git "$REPO_PATH"; then
            success "Repository cloned"
        else
            error "Failed to clone repository"
            return 1
        fi
    fi

    mkdir -p "$config_dir"
    echo "$REPO_PATH" > "$config_file"
    chmod 600 "$config_file"
    success "Repository location configured: $config_file → $REPO_PATH"
}
#################################################

#################### Hardware configuration
setup_hardware_config() {
    local hw_src="/etc/nixos/hardware-configuration.nix"
    local hw_dst="$REPO_PATH/system/nixos/hardware-configuration.nix"

    if [ -f "$hw_dst" ] && grep -q "DO NOT EDIT" "$hw_dst" 2>/dev/null; then
        info "Hardware config already present at $hw_dst (generated)"
        return 0
    fi

    if [ -f "$hw_src" ]; then
        info "Importing hardware-configuration.nix from $hw_src"
        mkdir -p "$(dirname "$hw_dst")"
        cp "$hw_src" "$hw_dst"
        success "Copied $hw_src → $hw_dst"
        return 0
    fi

    if command -v nixos-generate-config &>/dev/null; then
        info "Generating hardware-configuration.nix..."
        local tmpdir
        tmpdir=$(mktemp -d)
        if sudo nixos-generate-config --show-hardware-config 2>/dev/null | sudo tee "$tmpdir/hardware-configuration.nix" >/dev/null; then
            mkdir -p "$(dirname "$hw_dst")"
            cp "$tmpdir/hardware-configuration.nix" "$hw_dst"
            rm -rf "$tmpdir"
            success "Generated $hw_dst"
        else
            rm -rf "$tmpdir"
            warning "Could not generate hardware-configuration.nix (will use placeholder)"
            mkdir -p "$(dirname "$hw_dst")"
            if [ ! -f "$hw_dst" ]; then
                cat > "$hw_dst" <<'HW_EOF'
# Placeholder - replace with `sudo nixos-generate-config --show-hardware-config`
# or run: sudo nixos-generate-config --dir /tmp && cp /tmp/hardware-configuration.nix system/nixos/
{ config, lib, pkgs, modulesPath, ... }:
{
  imports = [ (modulesPath + "/installer/scan/not-detected.nix") ];
  boot.loader.systemd-boot.enable = lib.mkDefault true;
  boot.loader.efi.canTouchEfiVariables = lib.mkDefault true;
  fileSystems."/" = lib.mkDefault { device = "/dev/disk/by-label/nixos"; fsType = "ext4"; };
}
HW_EOF
                warning "Wrote placeholder $hw_dst — replace before deploying to real hardware"
            fi
        fi
    else
        warning "nixos-generate-config not found; keeping existing $hw_dst if present"
    fi
}
#################################################

#################### Apply NixOS configuration
apply_configuration() {
    local flake_path="$REPO_PATH/system/nixos"

    if [ ! -f "$flake_path/flake.nix" ]; then
        error "Flake not found at $flake_path/flake.nix"
        return 1
    fi

    # Ensure experimental features for this invocation
    export NIX_CONFIG="experimental-features = nix-command flakes"

    # Optionally set hostname before rebuild (so networking.hostName matches)
    if [[ "$HOSTNAME" != "nixos" ]]; then
        info "Hostname $HOSTNAME will be applied via nixos rebuild (networking.hostName)"
    fi

    # If an SSH key was supplied, ensure it lands in the flake's authorizedKeys
    # The flake reads extra keys from /tmp/outfitting-ssh-key if present (see configuration.nix).
    if [[ -n "$SSH_KEY" ]]; then
        if [[ "$SSH_KEY" =~ ^https?:// ]]; then
            info "Fetching SSH key from $SSH_KEY..."
            local key_content
            if key_content=$(curl -fsSL "$SSH_KEY" 2>/dev/null); then
                echo "$key_content" | sudo tee /tmp/outfitting-ssh-key >/dev/null
                sudo chmod 600 /tmp/outfitting-ssh-key 2>/dev/null || true
            else
                warning "Failed to fetch SSH key URL: $SSH_KEY"
            fi
        else
            echo "$SSH_KEY" | sudo tee /tmp/outfitting-ssh-key >/dev/null
            sudo chmod 600 /tmp/outfitting-ssh-key 2>/dev/null || true
        fi
    fi

    # Detect live ISO vs installed system
    local rebuild_cmd="switch"
    if [ -f /etc/NIXOS ] && [ ! -d /run/current-system ] 2>/dev/null; then
        : # normal installed system
        :
    fi
    # If we're on the installer ISO, `nixos-install` is the correct entry point
    if command -v nixos-install &>/dev/null && [ ! -f /run/current-system/nixos-version ] 2>/dev/null && [ -d /mnt/etc ] 2>/dev/null; then
        warning "Installer ISO detected — use nixos-install instead of nixos-rebuild"
        info "Run: sudo nixos-install --flake path:$flake_path#$FLAKE_TARGET"
        return 0
    fi

    info "Rebuilding NixOS: nixos-rebuild $rebuild_cmd --flake path:$flake_path#$FLAKE_TARGET"
    if sudo nixos-rebuild "$rebuild_cmd" --flake "path:$flake_path#$FLAKE_TARGET"; then
        success "NixOS $FLAKE_TARGET activated"
    else
        error "nixos-rebuild failed"
        return 1
    fi
}
#################################################

#################### Post-install info
post_install_info() {
    echo ""
    success "Installation complete! (mode: $MODE, target: $FLAKE_TARGET)"
    echo ""
    info "Next steps:"
    echo "  sudo nixos-rebuild switch --flake path:$REPO_PATH/system/nixos#$FLAKE_TARGET   # re-apply after edits"
    echo "  sudo nixos-rebuild switch --flake path:$REPO_PATH/system/nixos#server          # headless server"
    echo "  sudo nixos-rebuild switch --flake path:$REPO_PATH/system/nixos#desktop         # GUI workstation"
    echo ""
    info "Useful commands:"
    echo "  nixos-option networking.hostName       # inspect options"
    echo "  nix flake update --flake $REPO_PATH/system/nixos  # bump inputs"
    echo "  sudo nix-collect-garbage -d            # garbage collect"
    echo ""
    if [[ "$MODE" == "server" ]]; then
        info "Server profile: SSH enabled, firewall 22/80/443, Docker enabled, no GUI."
    else
        info "Desktop profile: GNOME + GDM, SSH, Docker, GUI apps enabled."
    fi
    echo ""
}
#################################################

############################################ Main
main() {
    echo ""
    info "NixOS Outfitting Setup"
    echo ""

    ensure_root_hint
    check_nixos
    configure_repo
    setup_hardware_config
    apply_configuration
    post_install_info
}
main
#################################################
