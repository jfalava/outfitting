#=====================================
# ZSH Configuration for macOS
#=====================================

# ---- macOS-Specific PATH Additions ----
# Homebrew
if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# ---- Smart App Bundle PATH Detection ----
# Auto-add VS Code-like app bundles that have bin directories to PATH
for app_dir in /Applications/*.app; do
    if [[ -d "$app_dir/Contents/Resources/app/bin" ]]; then
        path_prepend "$app_dir/Contents/Resources/app/bin"
    fi
done

# ---- macOS-Specific Functions ----

# Quick nix package test (creates temporary shell with package)
nix-test() {
    if [ -z "$1" ]; then
        echo "Usage: nix-test <package-name>"
        echo "Example: nix-test bat"
        return 1
    fi
    echo "Testing package: $1"
    nix shell "nixpkgs#$1" --command "$1" --version
}

# Search and install test (search then test)
nix-try() {
    if [ -z "$1" ]; then
        echo "Usage: nix-try <search-term>"
        echo "Example: nix-try ripgrep"
        return 1
    fi
    echo "Searching for packages matching: $1"
    nix search nixpkgs "$1"
    echo ""
    echo "To test a specific package: nix-test <package-name>"
}

# Find process using a port (macOS native)
port() {
    if [ -z "$1" ]; then
        echo "Usage: port <port_number>"
        return 1
    fi
    lsof -i ":$1"
}

# ---------------------------------------------------------------------------
# Outfitting manager forwarders
# Package update / nix-darwin / inventory live in outfitting-manager.
# Shell keeps session env (above) + Nix fallback paths + thin aliases.
# ---------------------------------------------------------------------------

# Nix fallback helper — reads the same repo-path file the manager uses.
get_outfitting_repo() {
    local config_file="${OUTFITTING_STATE_ROOT:-$HOME/.config/outfitting}/repo-path"
    if [ -f "$config_file" ]; then
        cat "$config_file"
        return 0
    fi
    return 1
}

# Native fallback paths remain available when the compiled manager is missing.
hm-fallback-update-nix() {
    local action="${1:-switch}"
    local repo_path
    repo_path=$(get_outfitting_repo) || {
        echo "Error: Repository location not configured."
        echo "Run 'outfitting-manager setup --repo /path/to/outfitting' to configure."
        return 1
    }
    command -v nix >/dev/null 2>&1 || {
        echo "Error: nix is not installed or not in PATH."
        return 1
    }

    local flake_path="$repo_path/system/macos"
    mkdir -p "$HOME/.nixpkgs" "$HOME/.config" || return 1
    ln -sfn "$flake_path/darwin.nix" "$HOME/.nixpkgs/darwin-configuration.nix"
    ln -sfn "$flake_path" "$HOME/.config/home-manager"

    case "$action" in
        build)
            OUTFITTING_REPO="$repo_path" env -u NIX_PATH nix build \
                --no-link --print-out-paths --impure \
                "path:$flake_path#darwinConfigurations.macos.system"
            ;;
        switch)
            local system_config
            system_config=$(OUTFITTING_REPO="$repo_path" env -u NIX_PATH nix build \
                --no-link --print-out-paths --impure \
                "path:$flake_path#darwinConfigurations.macos.system") || return 1
            sudo -H HOME=/var/root env -u SUDO_HOME -u NIX_PATH \
                nix-env -p /nix/var/nix/profiles/system --set "$system_config" || return 1
            sudo -H HOME=/var/root env -u SUDO_HOME -u NIX_PATH SUDO_USER="$USER" \
                "$system_config/sw/bin/darwin-rebuild" activate
            ;;
        test)
            OUTFITTING_REPO="$repo_path" env -u NIX_PATH nix build \
                --no-link --impure \
                "path:$flake_path#darwinConfigurations.macos.system"
            ;;
        dry)
            OUTFITTING_REPO="$repo_path" env -u NIX_PATH nix build \
                --dry-run --no-link --impure \
                "path:$flake_path#darwinConfigurations.macos.system"
            ;;
        *)
            echo "Usage: hm-build | hm-switch | hm-test | hm-dry"
            return 1
            ;;
    esac
}

# Home Manager compatibility helpers. The flake remains at system/macos.
hm-nix() {
    local action="${1:-switch}"
    case "$action" in
        build|switch|test|dry)
            ;;
        *)
            echo "Usage: hm-build | hm-switch | hm-test | hm-dry"
            return 1
            ;;
    esac

    if command -v outfitting-manager >/dev/null 2>&1; then
        command outfitting-manager update nix "$action"
    else
        hm-fallback-update-nix "$action"
    fi
}

hm-build() {
    hm-nix build
}

hm-switch() {
    hm-nix switch
}

hm-test() {
    hm-nix test
}

hm-dry() {
    hm-nix dry
}

hm-recover() {
    if command -v outfitting-manager >/dev/null 2>&1; then
        command outfitting-manager recover nix
        return $?
    fi

    echo "Error: Nix recovery requires outfitting-manager."
    echo "Install or restore outfitting-manager, then run 'hm-recover'."
    echo "Checkpoint dir: \${XDG_STATE_HOME:-\$HOME/.local/state}/outfitting/nix-lock-recovery"
    return 1
}

hm-sync() {
    hm-switch
}

hm-switch-local() {
    hm-switch
}

hm-update() {
    # Previously ran flake upgrade; manager v1 has no upgrade — switch only.
    echo "Note: hm-update no longer bumps flake inputs (manager v1)."
    hm-switch
}

hm-rollback() {
    echo "Available generations:"
    darwin-rebuild --list-generations
    echo ""
    echo "To rollback to previous generation:"
    echo "  darwin-rebuild rollback"
}

hm-clean() {
    echo "Cleaning old nix-darwin generations..."
    sudo nix-collect-garbage -d
    echo "Cleaning complete!"
}

# Standard outfit entrypoints. The manager owns the complete command surface;
# bare `outfit` now has the same behavior as bare `outfitting-manager`.
alias outfit='outfitting-manager'
alias o='outfitting-manager'
