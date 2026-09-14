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
# Shell keeps session env (above) + sudo -v priming + thin aliases.
# Dual-run verified green on the compiled cli/dist binary before this thin-out.
# ---------------------------------------------------------------------------

outfit-require-manager() {
    if command -v outfitting-manager >/dev/null 2>&1; then
        return 0
    fi

    echo "Error: outfitting-manager is not installed or not in PATH."
    echo "Build cli and link its binary into ~/.local/bin (or install a release)."
    return 1
}

# Legacy helpers — same repo-path file the manager reads/writes.
get_outfitting_repo() {
    local config_file="${OUTFITTING_STATE_ROOT:-$HOME/.config/outfitting}/repo-path"
    if [ -f "$config_file" ]; then
        cat "$config_file"
        return 0
    fi
    return 1
}

set_outfitting_repo() {
    local repo_path="$1"
    if [ -z "$repo_path" ]; then
        echo "Usage: set_outfitting_repo /path/to/outfitting"
        return 1
    fi

    if command -v outfitting-manager >/dev/null 2>&1; then
        outfitting-manager setup --repo "$repo_path" --no-fetch
        return $?
    fi

    repo_path="$(cd "$repo_path" 2>/dev/null && pwd)" || {
        echo "Error: Path does not exist: $repo_path"
        return 1
    }

    local config_dir="${OUTFITTING_STATE_ROOT:-$HOME/.config/outfitting}"
    mkdir -p "$config_dir" || return 1
    print -r -- "$repo_path" > "$config_dir/repo-path" || return 1
    chmod 600 "$config_dir/repo-path"
    echo "Repository path set to: $repo_path"
}

# Native fallback paths remain available when the compiled manager is missing.
outfit-fallback-update-nix() {
    local action="${1:-switch}"
    local repo_path
    repo_path=$(get_outfitting_repo) || {
        echo "Error: Repository location not configured."
        echo "Run 'set_outfitting_repo /path/to/outfitting' to configure."
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

outfit-fallback-update-brew() {
    local repo_path
    repo_path=$(get_outfitting_repo) || {
        echo "Error: Repository location not configured."
        echo "Run 'set_outfitting_repo /path/to/outfitting' to configure."
        return 1
    }
    command -v brew >/dev/null 2>&1 || {
        echo "Error: Homebrew is not installed or not in PATH."
        return 1
    }

    local brewfile="$repo_path/packages/macos/Brewfile"
    [ -f "$brewfile" ] || {
        echo "Error: Homebrew manifest not found: $brewfile"
        return 1
    }

    local tap trust_output
    while IFS= read -r tap; do
        if [[ -n "$tap" ]]; then
            trust_output=$(brew trust --tap "$tap" 2>&1)
            [[ "$trust_output" == *"Already trusted"* ]] || echo "$trust_output"
        fi
    done < <(sed -n -E "s/^[[:space:]]*tap[[:space:]]+['\"]([^'\"]+)['\"].*/\1/p" "$brewfile")

    brew bundle --file="$brewfile" || return 1
    brew upgrade || return 1
    brew upgrade --cask || return 1
    brew bundle cleanup --file="$brewfile" --cask --force
}

outfit-fallback-update-bun() {
    command -v bun >/dev/null 2>&1 || {
        echo "Error: Bun is not installed or not in PATH."
        return 1
    }
    bun update --global
}

outfit-fallback-update() {
    local manager="$1"
    shift
    case "$manager" in
        nix)
            outfit-fallback-update-nix "${1:-switch}"
            ;;
        brew)
            outfit-fallback-update-brew
            ;;
        bun)
            outfit-fallback-update-bun
            ;;
        all)
            local status=0
            outfit-fallback-update-nix switch || status=1
            outfit-fallback-update-brew || status=1
            outfit-fallback-update-bun || status=1
            return $status
            ;;
        *)
            echo "Usage: outfit update [nix|brew|bun|all]"
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

outfit-homebrew() {
    if ! command -v outfitting-manager >/dev/null 2>&1; then
        outfit-fallback-update-brew
        return $?
    fi
    case "${1:-upgrade}" in
        sync|s|install|i|upgrade|u|"")
            # Manager always runs the full brew path (bundle + upgrade + cleanup + snapshot).
            outfitting-manager update brew
            ;;
        *)
            echo "Usage: outfit-homebrew [sync|upgrade]"
            echo "  Delegates to: outfitting-manager update brew"
            return 1
            ;;
    esac
}

outfit-snapshot() {
    case "${1:-brew}" in
        brew)
            ;;
        *)
            echo "Usage: outfit snapshot brew"
            return 1
            ;;
    esac

    if command -v outfitting-manager >/dev/null 2>&1; then
        outfitting-manager snapshot brew
        return $?
    fi

    echo "Error: outfitting-manager is unavailable; standalone Homebrew snapshots require the manager."
    return 1
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
# the native fallback keeps the same update tree available if it is unavailable.
outfit() {
    if command -v outfitting-manager >/dev/null 2>&1; then
        local -a manager_args
        if (( $# == 0 )); then
            manager_args=(update nix switch)
        else
            case "$1" in
                update|setup|lockfiles|fonts|provision)
                    manager_args=("$@")
                    ;;
                build|switch|test|dry)
                    manager_args=(update nix "$@")
                    ;;
                sync)
                    manager_args=(update brew "${@:2}")
                    ;;
                upgrade)
                    manager_args=(update all "${@:2}")
                    ;;
                snapshot)
                    outfit-snapshot "${@:2}"
                    return $?
                    ;;
                recover)
                    outfit-recover "${@:2}"
                    return $?
                    ;;
                *)
                    echo "Usage: outfit [update|snapshot|recover|setup|sync|lockfiles|fonts|provision|upgrade] ..."
                    return 1
                    ;;
            esac
        fi
        command outfitting-manager "${manager_args[@]}"
        return $?
    fi

    case "${1:-switch}" in
        update)
            shift
            outfit-fallback-update "${1:-nix}" "${@:2}"
            ;;
        build|switch|test|dry)
            outfit-fallback-update nix "$1"
            ;;
        sync|s)
            outfit-fallback-update brew
            ;;
        upgrade|u)
            outfit-fallback-update all
            ;;
        *)
            echo "Error: outfitting-manager is unavailable and no native fallback exists for '$1'."
            return 1
            ;;
    esac
}

# Full machine update: sudo -v once, then manager update all.
update-all() {
    if ! command -v outfitting-manager >/dev/null 2>&1; then
        outfit-fallback-update all
        return $?
    fi
    sudo -v || return 1
    outfitting-manager update all
    local status=$?
    # Optional GC remains shell-owned (not in manager all by design).
    if hm-clean; then
        :
    else
        echo "Warning: Nix garbage collection failed." >&2
        status=1
    fi
    return $status
}

# Profile-only refresh without package managers.
update-all-no-nix() {
    local repo_path
    repo_path=$(get_outfitting_repo) || {
        echo "Error: Repository location not configured."
        echo "Run 'set_outfitting_repo /path/to/outfitting' or 'outfitting-manager setup --repo …'."
        return 1
    }

    echo ""
    echo "❖ Updating dotfiles"
    if git -C "$repo_path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        git -C "$repo_path" pull --ff-only
    else
        echo "Warning: $repo_path is not a git repository, skipping pull."
    fi

    echo ""
    echo "System updated (no package managers). Run 'outfit update nix switch' to apply profile changes."
}
