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
    outfit-require-manager || return 1
    if [ -z "$repo_path" ]; then
        echo "Usage: set_outfitting_repo /path/to/outfitting"
        echo "  (or: outfitting-manager setup --repo /path/to/outfitting)"
        return 1
    fi
    outfitting-manager setup --repo "$repo_path" --no-fetch
}

# nix-darwin rebuild (no flake-input upgrade in the manager yet).
outfit-rebuild() {
    outfit-require-manager || return 1
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
    outfit-require-manager || return 1
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
    outfit-require-manager || return 1
    # Snapshot is included after a successful brew update; brew --no-sync skips push.
    # For a standalone snapshot, re-run brew with network only for inventory is heavy;
    # push path is owned by update brew. Expose manager sync push docs:
    echo "Homebrew inventory is pushed by 'outfitting-manager update brew'."
    echo "To push an existing inventory file: outfitting-manager sync push <machine> homebrew-inventory <path>"
    return 0
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

# Standard outfit entrypoint — thin aliases over the manager.
outfit() {
    outfit-require-manager || return 1
    case "${1:-switch}" in
        snapshot)
            shift
            if (( $# != 0 )); then
                echo "Usage: outfit snapshot"
                return 1
            fi
            outfit-snapshot
            ;;
        sync|s)
            shift
            outfitting-manager update brew
            ;;
        upgrade|u)
            shift
            echo "❖ Nix switch + Homebrew (manager update all without bun is not separate; use update-all)"
            echo "  Running: outfitting-manager update nix switch && outfitting-manager update brew"
            outfitting-manager update nix switch || return 1
            outfitting-manager update brew || return 1
            ;;
        recover)
            shift
            if (( $# != 0 )); then
                echo "Usage: outfit recover"
                return 1
            fi
            echo "Error: Nix upgrade recovery is not exposed in outfitting-manager v1 yet."
            echo "Recovery checkpoint helpers exist in the CLI; a recover subcommand is forthcoming."
            echo "Checkpoint dir: \${XDG_STATE_HOME:-\$HOME/.local/state}/outfitting/nix-lock-recovery"
            return 1
            ;;
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
        *)
            echo "Usage: outfit [build|switch|test|dry|sync|upgrade|snapshot]"
            echo "  build/b    - outfitting-manager update nix build"
            echo "  switch     - outfitting-manager update nix switch (default)"
            echo "  test/t     - outfitting-manager update nix test"
            echo "  dry/d      - outfitting-manager update nix dry"
            echo "  sync/s     - outfitting-manager update brew"
            echo "  upgrade/u  - nix switch then brew"
            echo "  snapshot   - see brew inventory push notes"
            return 1
            ;;
    esac
}

# Full machine update: sudo -v once, then manager update all.
update-all() {
    outfit-require-manager || return 1
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
    echo "System updated (no package managers). Run 'outfit switch' to apply profile changes."
}
