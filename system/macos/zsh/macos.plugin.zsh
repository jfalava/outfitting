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

# Outfitting repository configuration functions
get_outfitting_repo() {
    local config_file="$HOME/.config/outfitting/repo-path"
    if [ -f "$config_file" ]; then
        cat "$config_file"
        return 0
    else
        return 1
    fi
}

set_outfitting_repo() {
    local repo_path="$1"
    if [ -z "$repo_path" ]; then
        echo "Error: No repository path provided"
        return 1
    fi

    # Convert to absolute path
    repo_path="$(cd "$repo_path" 2>/dev/null && pwd)" || {
        echo "Error: Path does not exist: $repo_path"
        return 1
    }

    local config_dir="$HOME/.config/outfitting"
    local config_file="$config_dir/repo-path"

    # Create config directory
    mkdir -p "$config_dir"

    # Store path
    echo "$repo_path" > "$config_file"
    chmod 600 "$config_file"

    echo "Repository path set to: $repo_path"
    return 0
}

outfit-require-manager() {
    if command -v outfitting-manager >/dev/null 2>&1; then
        return 0
    fi

    echo "Error: outfitting-manager is not installed or not in PATH."
    echo "Build manager/cli and link its binary into ~/.local/bin."
    return 1
}

# Pull the canonical Nix lock into a physical temporary path. Nix rejects
# external lock paths whose ancestors include macOS's /tmp or /var symlinks.
outfit-open-nix-lock() {
    outfit-require-manager || return 1

    local lock_dir_display lock_dir lock_path
    lock_dir_display=$(mktemp -d "${TMPDIR:-/tmp}/outfitting-nix-lock.XXXXXX") || {
        echo "Error: Could not create a temporary Nix lock directory." >&2
        return 1
    }
    lock_dir=$(cd "$lock_dir_display" && pwd -P) || {
        rmdir -- "$lock_dir_display" 2>/dev/null
        return 1
    }
    lock_path="$lock_dir/flake.lock"

    local pull_status=0
    outfitting-manager lockfiles pull jfalava:aarch64-darwin nix "$lock_path" >&2 || pull_status=$?

    if (( pull_status == 137 )); then
        echo "Warning: outfitting-manager was killed (exit 137) — likely an unsigned binary after a Bun upgrade." >&2
        if command -v codesign >/dev/null 2>&1; then
            echo "Attempting to re-sign ~/.local/bin/outfitting-manager automatically..." >&2
            if codesign --force --sign - ~/.local/bin/outfitting-manager 2>&1; then
                echo "Re-signed successfully, retrying pull..." >&2
                pull_status=0
                outfitting-manager lockfiles pull jfalava:aarch64-darwin nix "$lock_path" >&2 || pull_status=$?
                if (( pull_status == 0 )); then
                    print -r -- "$lock_dir"
                    return 0
                fi
                echo "Warning: Retry still failed (exit $pull_status)." >&2
            else
                echo "Warning: Automatic re-sign failed. Run 'codesign --force --sign - ~/.local/bin/outfitting-manager' manually." >&2
            fi
        else
            echo "Warning: Run 'codesign --force --sign - ~/.local/bin/outfitting-manager' to re-sign, or re-run the macOS install script." >&2
        fi
    fi

    if (( pull_status != 0 )); then
        if (( pull_status != 137 )); then
            echo "Warning: Failed to pull remote Nix lock (outfitting-manager exit $pull_status)." >&2
        fi
        echo "Warning: Continuing with local flake.lock — remote lock unavailable. This may be outdated." >&2
        rm -f -- "$lock_path"
        rmdir -- "$lock_dir" 2>/dev/null
        rmdir -- "$lock_dir_display" 2>/dev/null
        return 1
    fi

    print -r -- "$lock_dir"
}

outfit-clean-nix-lock() {
    local lock_dir="$1"
    rm -f -- "$lock_dir/flake.lock" "$lock_dir/updated-flake.lock"
    rmdir -- "$lock_dir" 2>/dev/null
}

outfit-nix-recovery-dir() {
    print -r -- "${XDG_STATE_HOME:-$HOME/.local/state}/outfitting/nix-lock-recovery"
}

outfit-has-nix-recovery() {
    [ -d "$(outfit-nix-recovery-dir)" ]
}

outfit-prepare-nix-recovery() {
    local lock_path="$1"
    local base_hash="$2"
    local recovery_dir
    recovery_dir=$(outfit-nix-recovery-dir)
    local state_parent="${recovery_dir:h}"

    if [ -e "$recovery_dir" ]; then
        echo "Error: An unfinished Nix upgrade already exists."
        echo "Run 'outfit recover' before starting another upgrade."
        return 1
    fi

    mkdir -p -m 700 "$state_parent" || return 1
    local staging_dir
    staging_dir=$(mktemp -d "$state_parent/.nix-lock-recovery.XXXXXX") || return 1
    chmod 700 "$staging_dir"

    {
        cp -- "$lock_path" "$staging_dir/flake.lock" &&
            print -r -- "$base_hash" > "$staging_dir/base-hash" &&
            print -r -- "prepared" > "$staging_dir/phase" &&
            chmod 600 "$staging_dir/flake.lock" "$staging_dir/base-hash" "$staging_dir/phase" &&
            mv -- "$staging_dir" "$recovery_dir"
    } always {
        rm -f -- "$staging_dir/flake.lock" "$staging_dir/base-hash" "$staging_dir/phase" 2>/dev/null
        rmdir -- "$staging_dir" 2>/dev/null
    }
}

outfit-set-nix-recovery-phase() {
    local phase="$1"
    local recovery_dir
    recovery_dir=$(outfit-nix-recovery-dir)
    local phase_tmp="$recovery_dir/.phase.$$"

    print -r -- "$phase" > "$phase_tmp" &&
        chmod 600 "$phase_tmp" &&
        mv -f -- "$phase_tmp" "$recovery_dir/phase"
}

outfit-clear-nix-recovery() {
    local recovery_dir
    recovery_dir=$(outfit-nix-recovery-dir)
    rm -f -- "$recovery_dir/flake.lock" "$recovery_dir/base-hash" "$recovery_dir/phase"
    rmdir -- "$recovery_dir" 2>/dev/null
}

outfit-build-nix-system() {
    local flake_path="$1"
    local lock_path="${2:-}"

    if [[ -n "$lock_path" && -f "$lock_path" ]]; then
        OUTFITTING_REPO="$(get_outfitting_repo)" env -u NIX_PATH nix build \
            --no-link --print-out-paths --impure \
            --reference-lock-file "$lock_path" --no-write-lock-file \
            "path:$flake_path#darwinConfigurations.macos.system"
    else
        if [[ -n "$lock_path" ]]; then
            echo "Warning: Remote lock not found at $lock_path, building with local flake.lock." >&2
        else
            echo "Warning: Building with local flake.lock (remote unavailable)." >&2
        fi
        OUTFITTING_REPO="$(get_outfitting_repo)" env -u NIX_PATH nix build \
            --no-link --print-out-paths --impure \
            "path:$flake_path#darwinConfigurations.macos.system"
    fi
}

outfit-activate-nix-system() {
    local system_config="$1"

    sudo -H HOME=/var/root env -u SUDO_HOME -u NIX_PATH \
        nix-env -p /nix/var/nix/profiles/system --set "$system_config" || return 1
    sudo -H HOME=/var/root env -u SUDO_HOME -u NIX_PATH SUDO_USER="$USER" \
        "$system_config/sw/bin/darwin-rebuild" activate
}

outfit-recover-nix-upgrade() {
    outfit-require-manager || return 1

    local repo_path
    repo_path=$(get_outfitting_repo) || {
        echo "Error: Repository location not configured."
        return 1
    }

    local recovery_dir
    recovery_dir=$(outfit-nix-recovery-dir)
    local recovery_lock="$recovery_dir/flake.lock"
    local base_hash_file="$recovery_dir/base-hash"
    local phase_file="$recovery_dir/phase"

    if [ ! -f "$recovery_lock" ] || [ ! -f "$base_hash_file" ] || [ ! -f "$phase_file" ]; then
        echo "Error: No complete Nix upgrade recovery checkpoint exists."
        return 1
    fi

    local base_hash phase
    base_hash=$(<"$base_hash_file")
    phase=$(<"$phase_file")

    case "$phase" in
        prepared)
            echo "Resuming the interrupted nix-darwin activation..."
            local system_config
            system_config=$(outfit-build-nix-system "$repo_path/system/macos" "$recovery_lock") ||
                return 1
            outfit-activate-nix-system "$system_config" || return 1
            outfit-set-nix-recovery-phase activated || return 1
            ;;
        activated)
            echo "The recovered configuration is already activated."
            ;;
        *)
            echo "Error: Unknown Nix recovery phase: $phase"
            return 1
            ;;
    esac

    echo "Publishing the recovered lock if the remote base is unchanged..."
    outfitting-manager lockfiles push jfalava:aarch64-darwin nix "$recovery_lock" \
        --if-match "$base_hash" || {
        echo "Recovery checkpoint retained at: $recovery_dir"
        return 1
    }

    outfit-clear-nix-recovery
    echo "Nix upgrade recovery completed successfully."
}

# nix-darwin management functions
hm-sync() {
    local repo_path
    repo_path=$(get_outfitting_repo) || {
        echo "Error: Repository location not configured."
        echo "Run 'set_outfitting_repo /path/to/outfitting' to configure."
        return 1
    }

    # Ensure symlinks are set up correctly
    local darwin_target="$repo_path/system/macos/darwin.nix"
    local hm_target="$repo_path/system/macos"

    if [ ! -L ~/.nixpkgs/darwin-configuration.nix ] || [ "$(readlink -f ~/.nixpkgs/darwin-configuration.nix)" != "$(readlink -f "$darwin_target")" ]; then
        echo "Creating/updating symlink: ~/.nixpkgs/darwin-configuration.nix → $darwin_target"
        mkdir -p ~/.nixpkgs
        ln -sfn "$darwin_target" ~/.nixpkgs/darwin-configuration.nix
    fi

    if [ ! -L ~/.config/home-manager ] || [ "$(readlink -f ~/.config/home-manager)" != "$(readlink -f "$hm_target")" ]; then
        echo "Creating/updating symlink: ~/.config/home-manager → $hm_target"
        ln -sfn "$hm_target" ~/.config/home-manager
    fi

    outfit-rebuild switch
    echo "Synced from $repo_path"
}

hm-switch() {
    outfit-rebuild switch
}

hm-switch-local() {
    local repo_path
    repo_path=$(get_outfitting_repo) || {
        echo "Error: Repository location not configured."
        echo "Run 'set_outfitting_repo /path/to/outfitting' to configure."
        return 1
    }

    echo "Applying nix-darwin configuration from local repo..."

    # Ensure symlinks are set up correctly
    local darwin_target="$repo_path/system/macos/darwin.nix"
    local hm_target="$repo_path/system/macos"

    if [ ! -L ~/.nixpkgs/darwin-configuration.nix ] || [ "$(readlink -f ~/.nixpkgs/darwin-configuration.nix)" != "$(readlink -f "$darwin_target")" ]; then
        mkdir -p ~/.nixpkgs
        ln -sfn "$darwin_target" ~/.nixpkgs/darwin-configuration.nix
    fi

    if [ ! -L ~/.config/home-manager ] || [ "$(readlink -f ~/.config/home-manager)" != "$(readlink -f "$hm_target")" ]; then
        ln -sfn "$hm_target" ~/.config/home-manager
    fi

    outfit-rebuild switch
}

hm-update() {
    outfit-rebuild upgrade || return 1

    echo ""
    echo "Nix packages and the remote flake lock updated successfully!"
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

# Apply Homebrew-managed macOS packages and casks
outfit-homebrew() {
    local repo_path
    repo_path=$(get_outfitting_repo) || {
        echo "Error: Repository location not configured."
        echo "Run 'set_outfitting_repo /path/to/outfitting' to configure."
        return 1
    }

    if ! command -v brew >/dev/null 2>&1; then
        echo "Error: homebrew is not installed or not in PATH."
        return 1
    fi

    local brewfile="$repo_path/packages/macos/Brewfile"
    if [ ! -f "$brewfile" ]; then
        echo "Error: Homebrew cask manifest not found: $brewfile"
        return 1
    fi

    # Automatically trust taps listed in the Brewfile
    local tap trust_output
    while IFS= read -r tap; do
        if [[ -n "$tap" ]]; then
            trust_output=$(brew trust --tap "$tap" 2>&1)
            if [[ "$trust_output" != *"Already trusted"* ]]; then
                echo "$trust_output"
            fi
        fi
    done < <(sed -n -E "s/^[[:space:]]*tap[[:space:]]+['\"]([^'\"]+)['\"].*/\1/p" "$brewfile")

    case "${1:-sync}" in
        sync|s|install|i)
            echo "Applying Homebrew manifest..."
            brew bundle --file="$brewfile" || return 1
            echo ""
            echo "Removing Homebrew casks not in manifest..."
            brew bundle cleanup --file="$brewfile" --cask --force
            ;;
        upgrade|u)
            echo "Syncing Homebrew manifest..."
            brew bundle --file="$brewfile" || return 1
            echo ""
            echo "Upgrading installed Homebrew packages..."
            brew upgrade || return 1
            brew upgrade --cask || return 1
            echo ""
            echo "Removing Homebrew casks not in manifest..."
            brew bundle cleanup --file="$brewfile" --cask --force
            ;;
        *)
            echo "Usage: outfit-homebrew [sync|upgrade]"
            echo "  sync/s     - Apply the committed Homebrew manifest and remove unlisted casks (default)"
            echo "  upgrade/u  - Apply the manifest, upgrade Homebrew packages/casks, and remove unlisted casks"
            return 1
            ;;
    esac
}

# Store the observed Homebrew package state through outfitting-manager.
outfit-snapshot() {
    setopt localoptions pipefail

    outfit-require-manager || return 1
    if ! command -v brew >/dev/null 2>&1; then
        echo "Error: homebrew is not installed or not in PATH."
        return 1
    fi

    local snapshot_dir
    snapshot_dir=$(mktemp -d "${TMPDIR:-/tmp}/outfitting-snapshot.XXXXXX") || {
        echo "Error: Could not create a temporary snapshot directory."
        return 1
    }
    local homebrew_inventory="$snapshot_dir/homebrew-inventory.txt"
    local machine="jfalava:aarch64-darwin"
    local snapshot_status=0

    {
        echo "Capturing versioned Homebrew inventory..."
        {
            echo "outfitting-homebrew-inventory-v1"
            echo ""
            echo "[taps]"
            brew tap | LC_ALL=C sort
            echo ""
            echo "[formulae]"
            brew list --formula --versions | LC_ALL=C sort
            echo ""
            echo "[casks]"
            brew list --cask --versions | LC_ALL=C sort
        } > "$homebrew_inventory" || snapshot_status=1

        if (( snapshot_status == 0 )); then
            echo ""
            echo "Pushing macOS inventory..."
            local push_status=0
            outfitting-manager lockfiles push "$machine" homebrew-inventory "$homebrew_inventory" 2>&1 || push_status=$?
            if (( push_status != 0 )); then
                if (( push_status == 137 )); then
                    echo "Warning: outfitting-manager was killed (exit 137) during snapshot." >&2
                    echo "Warning: Run 'codesign --force --sign - ~/.local/bin/outfitting-manager' to re-sign." >&2
                else
                    echo "Warning: Failed to push inventory (outfitting-manager exit $push_status)." >&2
                fi
                snapshot_status=1
            fi
        fi
    } always {
        rm -f -- "$homebrew_inventory"
        rmdir -- "$snapshot_dir" 2>/dev/null
    }

    if (( snapshot_status != 0 )); then
        echo "Error: macOS snapshot did not complete."
        return 1
    fi

    echo ""
    echo "macOS inventory stored successfully."
}

# Standard outfit command entrypoint
outfit() {
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
            outfit-homebrew sync "$@" || return 1
            outfit-snapshot || echo "Warning: Snapshot failed, but sync completed. Run 'outfit snapshot' manually after fixing codesign." >&2
            ;;
        upgrade|u)
            shift
            echo "❖ Upgrading nix-darwin configuration"
            outfit-rebuild upgrade "$@" || return 1
            echo ""
            echo "❖ Upgrading Homebrew packages/casks"
            outfit-homebrew upgrade "$@" || return 1
            outfit-snapshot || echo "Warning: Snapshot failed, but upgrade completed. Run 'outfit snapshot' manually after fixing." >&2
            ;;
        recover)
            shift
            if (( $# != 0 )); then
                echo "Usage: outfit recover"
                return 1
            fi
            outfit-recover-nix-upgrade
            ;;
        build|b|switch|test|t|dry|d)
            outfit-rebuild "$@"
            ;;
        *)
            echo "Usage: outfit [build|switch|test|dry|sync|upgrade|snapshot|recover]"
            echo "  build/b    - Build nix-darwin configuration only"
            echo "  switch     - Build and apply nix-darwin configuration (default)"
            echo "  test/t     - Test nix-darwin build only"
            echo "  dry/d      - Dry-run nix-darwin changes"
            echo "  sync/s     - Apply the Homebrew manifest and remove unlisted casks"
            echo "  upgrade/u  - Upgrade nix-darwin config, then upgrade Homebrew packages/casks"
            echo "  snapshot   - Store the versioned installed Homebrew inventory"
            echo "  recover    - Resume an interrupted Nix upgrade checkpoint"
            return 1
            ;;
    esac
}

# Quick system update
update-all() {
     # Request elevation at the start
     sudo -v || return 1

     echo ""
     echo "❖ Updating Nix/Darwin"
     hm-update || return 1
     hm-clean || return 1

     echo ""
     echo "❖ Updating Homebrew Packages"
     outfit-homebrew upgrade || return 1

     echo ""
     echo "❖ Updating Global Bun Packages"
     bun-update-global

     echo ""
     echo "❖ Storing Homebrew Inventory"
     outfit-snapshot || {
         echo "Updates succeeded, but the Homebrew inventory could not be stored."
         return 1
     }

     echo ""
     echo "System updated successfully"
 }

# Update everything except Nix packages (useful for profile-only changes)
update-all-no-nix() {
    local repo_path
    repo_path=$(get_outfitting_repo) || {
        echo "Error: Repository location not configured."
        echo "Run 'set_outfitting_repo /path/to/outfitting' to configure."
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
    echo "System updated (no Nix packages). Run 'outfit switch' to apply profile changes."
}

# Quick nix-darwin rebuild from anywhere in the system
outfit-rebuild() {
    local repo_path
    repo_path=$(get_outfitting_repo) || {
        echo "Error: Repository location not configured."
        echo "Run 'set_outfitting_repo /path/to/outfitting' to configure."
        return 1
    }

    # Ensure symlinks exist
    local darwin_target="$repo_path/system/macos/darwin.nix"
    local hm_target="$repo_path/system/macos"
    local lock_dir remote_lock updated_lock
    local use_remote_lock=0
    if lock_dir=$(outfit-open-nix-lock); then
        remote_lock="$lock_dir/flake.lock"
        updated_lock="$lock_dir/updated-flake.lock"
        use_remote_lock=1
    else
        echo "Warning: Proceeding without remote lock — using local flake.lock." >&2
        echo "Warning: Run 'outfitting-manager lockfiles pull' manually to diagnose, or verify 'codesign -v ~/.local/bin/outfitting-manager'." >&2
        lock_dir=""
        remote_lock=""
        updated_lock=""
        use_remote_lock=0
    fi
    local rebuild_status=0

    if [ ! -L ~/.nixpkgs/darwin-configuration.nix ]; then
        mkdir -p ~/.nixpkgs
        ln -sfn "$darwin_target" ~/.nixpkgs/darwin-configuration.nix
    fi

    if [ ! -L ~/.config/home-manager ]; then
        ln -sfn "$hm_target" ~/.config/home-manager
    fi

    {
        case "${1:-switch}" in
            build|b)
                if (( use_remote_lock )); then
                    echo "Building nix-darwin configuration with the remote lock..."
                    OUTFITTING_REPO="$repo_path" env -u NIX_PATH nix build --impure \
                        --no-link \
                        --reference-lock-file "$remote_lock" --no-write-lock-file \
                        "path:$hm_target#darwinConfigurations.macos.system"
                else
                    echo "Building nix-darwin configuration with local flake.lock (remote unavailable)..." >&2
                    OUTFITTING_REPO="$repo_path" env -u NIX_PATH nix build --impure \
                        --no-link \
                        "path:$hm_target#darwinConfigurations.macos.system"
                fi
                rebuild_status=$?
                ;;
            switch|s)
                if (( use_remote_lock )); then
                    echo "Applying nix-darwin configuration with the remote lock..."
                else
                    echo "Applying nix-darwin configuration with local flake.lock (remote unavailable)..." >&2
                fi
                local system_config
                system_config=$(outfit-build-nix-system "$hm_target" "$remote_lock")
                rebuild_status=$?
                if (( rebuild_status == 0 )); then
                    outfit-activate-nix-system "$system_config"
                    rebuild_status=$?
                fi
                ;;
            test|t)
                if (( use_remote_lock )); then
                    echo "Testing nix-darwin configuration with the remote lock..."
                else
                    echo "Testing nix-darwin configuration with local flake.lock (remote unavailable)..." >&2
                fi
                outfit-build-nix-system "$hm_target" "$remote_lock" > /dev/null
                rebuild_status=$?
                (( rebuild_status == 0 )) && echo "Build successful - ready to switch"
                ;;
            dry|d)
                if (( use_remote_lock )); then
                    echo "Dry-run check with the remote lock..."
                    OUTFITTING_REPO="$repo_path" env -u NIX_PATH nix build \
                        --dry-run --no-link --impure \
                        --reference-lock-file "$remote_lock" --no-write-lock-file \
                        "path:$hm_target#darwinConfigurations.macos.system"
                else
                    echo "Dry-run check with local flake.lock (remote unavailable)..." >&2
                    OUTFITTING_REPO="$repo_path" env -u NIX_PATH nix build \
                        --dry-run --no-link --impure \
                        "path:$hm_target#darwinConfigurations.macos.system"
                fi
                rebuild_status=$?
                ;;
            upgrade|u)
                if outfit-has-nix-recovery; then
                    echo "Error: An unfinished Nix upgrade checkpoint exists."
                    echo "Run 'outfit recover' before starting another upgrade."
                    return 1
                fi

                local effective_remote_lock="$remote_lock"
                local effective_updated_lock="$updated_lock"
                local fallback_lock_dir=""

                if (( use_remote_lock )); then
                    echo "Updating the remote flake lock..."
                    env -u NIX_PATH nix flake update --flake "$hm_target" --impure \
                        --reference-lock-file "$effective_remote_lock" --output-lock-file "$effective_updated_lock"
                    rebuild_status=$?
                else
                    echo "Warning: Updating local flake.lock directly (remote unavailable)..." >&2
                    fallback_lock_dir=$(mktemp -d "${TMPDIR:-/tmp}/outfitting-nix-lock.XXXXXX") || {
                        echo "Error: Could not create temporary directory for flake update." >&2
                        rebuild_status=1
                    }
                    if (( rebuild_status == 0 )); then
                        fallback_lock_dir=$(cd "$fallback_lock_dir" && pwd -P) || fallback_lock_dir=""
                        if [[ -n "$fallback_lock_dir" ]]; then
                            effective_updated_lock="$fallback_lock_dir/updated-flake.lock"
                            env -u NIX_PATH nix flake update --flake "$hm_target" --impure \
                                --output-lock-file "$effective_updated_lock"
                            rebuild_status=$?
                        else
                            rebuild_status=1
                        fi
                    fi
                fi

                if (( rebuild_status == 0 )); then
                    echo "Applying updated nix-darwin configuration..."
                    local system_config
                    system_config=$(outfit-build-nix-system "$hm_target" "$effective_updated_lock")
                    rebuild_status=$?
                    if (( use_remote_lock && rebuild_status == 0 )); then
                        local base_hash_output base_hash
                        base_hash_output=$(shasum -a 256 "$effective_remote_lock")
                        rebuild_status=$?
                        if (( rebuild_status == 0 )); then
                            base_hash="${base_hash_output%% *}"
                            outfit-prepare-nix-recovery "$effective_updated_lock" "$base_hash"
                            rebuild_status=$?
                        fi
                    elif (( ! use_remote_lock && rebuild_status == 0 )); then
                        local base_hash="local"
                        outfit-prepare-nix-recovery "$effective_updated_lock" "$base_hash"
                        rebuild_status=$?
                    fi
                    if (( rebuild_status == 0 )); then
                        outfit-activate-nix-system "$system_config"
                        rebuild_status=$?
                        if (( rebuild_status == 0 )); then
                            outfit-set-nix-recovery-phase activated
                            rebuild_status=$?
                        fi
                    fi
                fi

                if (( rebuild_status == 0 )); then
                    local push_status=0
                    if (( use_remote_lock )); then
                        outfitting-manager lockfiles push jfalava:aarch64-darwin nix "$effective_updated_lock" \
                            --if-match "$base_hash" 2>&1 || push_status=$?
                    else
                        echo "Warning: Pushing updated lock without --if-match (no remote base)." >&2
                        outfitting-manager lockfiles push jfalava:aarch64-darwin nix "$effective_updated_lock" 2>&1 || push_status=$?
                    fi
                    if (( push_status != 0 )); then
                        if (( push_status == 137 )); then
                            echo "Warning: outfitting-manager was killed (exit 137) during push — likely an unsigned binary after a Bun upgrade." >&2
                            echo "Warning: Run 'codesign --force --sign - ~/.local/bin/outfitting-manager' to re-sign." >&2
                        else
                            echo "Warning: Failed to push updated Nix lock to remote (outfitting-manager exit $push_status)." >&2
                        fi
                        echo "Warning: Local activation succeeded but remote lock not updated. Other machines will stay on the old lock." >&2
                        echo "Warning: Retry with 'outfitting-manager lockfiles push jfalava:aarch64-darwin nix $effective_updated_lock' after fixing codesign." >&2
                        # Keep recovery for manual retry, but don't fail the overall upgrade (local is already active).
                        rebuild_status=0
                    else
                        outfit-clear-nix-recovery
                    fi
                fi

                if (( rebuild_status != 0 )) && outfit-has-nix-recovery; then
                    echo "Nix upgrade checkpoint retained at: $(outfit-nix-recovery-dir)"
                    echo "Run 'outfit recover' to resume it."
                fi
                if [[ -n "$fallback_lock_dir" ]]; then
                    rm -f -- "$effective_updated_lock"
                    rmdir -- "$fallback_lock_dir" 2>/dev/null
                fi
                ;;
            *)
                echo "Usage: outfit-rebuild [build|switch|test|dry|upgrade]"
                echo "  build/b    - Build configuration only"
                echo "  switch/s   - Build and apply configuration (default)"
                echo "  test/t     - Test build only"
                echo "  dry/d      - Dry-run to see what would change"
                echo "  upgrade/u  - Update the remote flake lock and apply"
                rebuild_status=1
                ;;
        esac
    } always {
        [[ -n "$lock_dir" ]] && outfit-clean-nix-lock "$lock_dir"
    }

    return $rebuild_status
}
