#=====================================
# ZSH Configuration for macOS
#=====================================

# ---- macOS-Specific PATH Additions ----
# Homebrew
if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
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
outfit-fallback-update-nix() {
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
            echo "Usage: outfit update nix [build|switch|test|dry]"
            return 1
            ;;
    esac
}

# nix-darwin rebuild (no flake-input upgrade in the manager yet).
outfit-rebuild() {
    if ! command -v outfitting-manager >/dev/null 2>&1; then
        outfit-fallback-update-nix "${1:-switch}"
        return $?
    fi
    case "${1:-switch}" in
        build|b)
            outfitting-manager update nix build
            ;;
        switch|s|"")
            outfitting-manager update nix switch
            ;;
        test|t)
            outfitting-manager update nix test
            ;;
        dry|d)
            outfitting-manager update nix dry
            ;;
        upgrade|u)
            echo "Error: flake lock upgrade is not in outfitting-manager v1."
            echo "Use 'outfitting-manager update nix switch' after updating locks manually,"
            echo "or restore the previous shell upgrade path from git history if needed."
            return 1
            ;;
        *)
            echo "Usage: outfit-rebuild [build|switch|test|dry]"
            echo "  build/b  - Build configuration only"
            echo "  switch/s - Build and activate (default)"
            echo "  test/t   - Test build only"
            echo "  dry/d    - Dry-run build"
            return 1
            ;;
    esac
}

outfit-recover() {
    case "${1:-nix}" in
        nix)
            ;;
        *)
            echo "Usage: outfit recover nix"
            return 1
            ;;
    esac

    if command -v outfitting-manager >/dev/null 2>&1; then
        outfitting-manager recover nix
        return $?
    fi

    echo "Error: Nix recovery requires outfitting-manager."
    echo "Install or restore outfitting-manager, then run 'outfit recover nix'."
    echo "Checkpoint dir: \${XDG_STATE_HOME:-\$HOME/.local/state}/outfitting/nix-lock-recovery"
    return 1
}

hm-sync() {
    outfit-rebuild switch
}

hm-switch() {
    outfit-rebuild switch
}

hm-switch-local() {
    outfit-rebuild switch
}

hm-update() {
    # Previously ran flake upgrade; manager v1 has no upgrade — switch only.
    echo "Note: hm-update no longer bumps flake inputs (manager v1)."
    outfit-rebuild switch
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

# Standard outfit entrypoint. The manager owns the hierarchical command path;
# the native fallback keeps Nix actions available if it is unavailable.
outfit() {
    if command -v outfitting-manager >/dev/null 2>&1; then
        local -a manager_args
        if (( $# == 0 )); then
            manager_args=(update nix switch)
        else
            case "$1" in
                build|switch|test|dry)
                    manager_args=(update nix "$@")
                    ;;
                *)
                    manager_args=("$@")
                    ;;
            esac
        fi
        command outfitting-manager "${manager_args[@]}"
        return $?
    fi

    case "${1:-switch}" in
        update)
            if [[ "${2:-nix}" != "nix" ]]; then
                echo "Error: outfitting-manager is required for '$2' updates."
                return 1
            fi
            outfit-fallback-update-nix "${3:-switch}"
            ;;
        build|switch|test|dry)
            outfit-fallback-update-nix "$1"
            ;;
        recover)
            outfit-recover "${@:2}"
            ;;
        *)
            echo "Error: outfitting-manager is unavailable; only Nix actions have a shell fallback."
            return 1
            ;;
    esac
}
