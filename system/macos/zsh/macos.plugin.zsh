#=====================================
# ZSH Configuration for macOS
#=====================================

# ---- macOS-Specific PATH Additions ----
# Static prepends are managed by home.sessionPath.
path_append "$HOME/go/bin"

# Homebrew
if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
fi

# Bun
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# Yarn
path_append "$HOME/.yarn/switch/bin"
path_append "$HOME/.yarn/switch"

# UV
path_append "$HOME/.local/share/uv/bin"

# Cargo
path_append "$HOME/.cargo/bin"

# Amp Code
path_append "$HOME/.amp/bin"

# Git AI
path_append "$HOME/.git-ai/bin"

# Vite+
path_append "$HOME/.vite-plus/bin"

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
        echo "Error: Could not create a temporary Nix lock directory."
        return 1
    }
    lock_dir=$(cd "$lock_dir_display" && pwd -P) || {
        rmdir -- "$lock_dir_display" 2>/dev/null
        return 1
    }
    lock_path="$lock_dir/flake.lock"

    if ! outfitting-manager lockfiles pull jfalava:aarch64-darwin nix "$lock_path" >&2; then
        rm -f -- "$lock_path"
        rmdir -- "$lock_dir" 2>/dev/null
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
    local lock_path="$2"

    OUTFITTING_REPO="$(get_outfitting_repo)" env -u NIX_PATH nix build \
        --no-link --print-out-paths --impure \
        --reference-lock-file "$lock_path" --no-write-lock-file \
        "path:$flake_path#darwinConfigurations.macos.system"
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

# Update all global Bun packages
bun-update-global() {
    if ! command -v bun >/dev/null; then
        echo "Bun not installed, skipping..."
        return 0
    fi

    echo ""
    echo "Updating global Bun packages..."

    local packages
    local pm_ls_output pm_ls_status
    pm_ls_output=$(bun pm ls -g 2>&1)
    pm_ls_status=$?
    if [ $pm_ls_status -ne 0 ]; then
        echo "Error: bun pm ls -g failed"
        echo "$pm_ls_output"
        return $pm_ls_status
    fi

    packages=$(echo "$pm_ls_output" | sed -n '2,$s/^[^a-zA-Z@]*//p')

    if [ -z "$packages" ]; then
        echo "No global Bun packages found"
        return 0
    fi

    echo "Found global packages:"
    echo "$packages"
    echo ""

    if ! command -v uv >/dev/null; then
        echo "uv not installed, cannot query registry"
        return 1
    fi

    local updated=0
    local failed=0
    while IFS= read -r pkg; do
        pkg=$(echo "$pkg" | tr -d ' ')
        if [ -z "$pkg" ]; then
            continue
        fi

        local installed_version name latest_version
        installed_version="${pkg##*@}"
        name="${pkg%@$installed_version}"
        if [ -z "$name" ] || [ -z "$installed_version" ] || [ "$name@$installed_version" != "$pkg" ]; then
            echo "Skipping unrecognized entry: $pkg"
            continue
        fi

        echo -n "Checking $name (installed $installed_version)... "
        latest_version=$(uv -q run --no-project python - "$name" <<'PY'
import json, sys, urllib.request, urllib.parse
pkg = sys.argv[1]
url = "https://registry.npmjs.org/" + urllib.parse.quote(pkg, safe="@/")
with urllib.request.urlopen(url) as r:
    data = json.load(r)
print(data.get("dist-tags", {}).get("latest", ""))
PY
        )
        if [ -z "$latest_version" ]; then
            echo "failed to fetch latest"
            ((failed++))
            continue
        fi

        if [ "$latest_version" = "$installed_version" ]; then
            echo "up to date"
            continue
        fi

        echo "updating to $latest_version"
        if bun add -g "$name@$latest_version"; then
            echo "✓"
            ((updated++))
        else
            echo "failed"
            ((failed++))
        fi
    done <<< "$packages"

    echo "Updated $updated global Bun package(s)"
    if [ $failed -ne 0 ]; then
        echo "Failed $failed package(s)"
    fi
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
            outfitting-manager lockfiles push "$machine" homebrew-inventory "$homebrew_inventory" || snapshot_status=1
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
            outfit-snapshot
            ;;
        upgrade|u)
            shift
            echo "❖ Upgrading nix-darwin configuration"
            outfit-rebuild upgrade "$@" || return 1
            echo ""
            echo "❖ Upgrading Homebrew packages/casks"
            outfit-homebrew upgrade "$@" || return 1
            outfit-snapshot
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
    local lock_dir
    lock_dir=$(outfit-open-nix-lock) || return 1
    local remote_lock="$lock_dir/flake.lock"
    local updated_lock="$lock_dir/updated-flake.lock"
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
                echo "Building nix-darwin configuration with the remote lock..."
                OUTFITTING_REPO="$repo_path" env -u NIX_PATH nix build --impure \
                    --no-link \
                    --reference-lock-file "$remote_lock" --no-write-lock-file \
                    "path:$hm_target#darwinConfigurations.macos.system"
                rebuild_status=$?
                ;;
            switch|s)
                echo "Applying nix-darwin configuration with the remote lock..."
                local system_config
                system_config=$(outfit-build-nix-system "$hm_target" "$remote_lock")
                rebuild_status=$?
                if (( rebuild_status == 0 )); then
                    outfit-activate-nix-system "$system_config"
                    rebuild_status=$?
                fi
                ;;
            test|t)
                echo "Testing nix-darwin configuration with the remote lock..."
                outfit-build-nix-system "$hm_target" "$remote_lock" > /dev/null
                rebuild_status=$?
                (( rebuild_status == 0 )) && echo "Build successful - ready to switch"
                ;;
            dry|d)
                echo "Dry-run check with the remote lock..."
                OUTFITTING_REPO="$repo_path" env -u NIX_PATH nix build \
                    --dry-run --no-link --impure \
                    --reference-lock-file "$remote_lock" --no-write-lock-file \
                    "path:$hm_target#darwinConfigurations.macos.system"
                rebuild_status=$?
                ;;
            upgrade|u)
                if outfit-has-nix-recovery; then
                    echo "Error: An unfinished Nix upgrade checkpoint exists."
                    echo "Run 'outfit recover' before starting another upgrade."
                    return 1
                fi

                echo "Updating the remote flake lock..."
                env -u NIX_PATH nix flake update --flake "$hm_target" --impure \
                    --reference-lock-file "$remote_lock" --output-lock-file "$updated_lock"
                rebuild_status=$?

                if (( rebuild_status == 0 )); then
                    echo "Applying updated nix-darwin configuration..."
                    local system_config
                    system_config=$(outfit-build-nix-system "$hm_target" "$updated_lock")
                    rebuild_status=$?
                    if (( rebuild_status == 0 )); then
                        local base_hash_output base_hash
                        base_hash_output=$(shasum -a 256 "$remote_lock")
                        rebuild_status=$?
                        if (( rebuild_status == 0 )); then
                            base_hash="${base_hash_output%% *}"
                            outfit-prepare-nix-recovery "$updated_lock" "$base_hash"
                            rebuild_status=$?
                        fi
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
                    outfitting-manager lockfiles push jfalava:aarch64-darwin nix "$updated_lock" \
                        --if-match "$base_hash"
                    rebuild_status=$?
                    if (( rebuild_status == 0 )); then
                        outfit-clear-nix-recovery
                    fi
                fi

                if (( rebuild_status != 0 )) && outfit-has-nix-recovery; then
                    echo "Nix upgrade checkpoint retained at: $(outfit-nix-recovery-dir)"
                    echo "Run 'outfit recover' to resume it."
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
        outfit-clean-nix-lock "$lock_dir"
    }

    return $rebuild_status
}
